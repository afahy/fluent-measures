import { MULTIPLIERS, NUMBER_WORDS } from './wordsToNumber';

/**
 * A word, a number or one other character. start and end place it in the converted text: the
 * text in lowercase, with each number written as the parser reads it.
 */
interface Token {
  text: string;
  start: number;
  end: number;
}

// The Unicode fractions ¼ to ¾, ⅐ to ⅞ and ↉, as the inside of a character class.
const FRACTIONS = '¼-¾⅐-⅞↉';
const NUMBER_WORD = [...NUMBER_WORDS.keys(), ...MULTIPLIERS.keys()].join('|');
const FRACTION = new RegExp(`[${FRACTIONS}]`);
const DIGIT_OR_FRACTION = new RegExp(`[\\d${FRACTIONS}]`);
// A run of numerals only, which a letter before it can still own, as in "a5²,1".
const NUMERALS = new RegExp(`^[\\d.${FRACTIONS}]*$`);
const SPACE = /\s/;
const MARK = /['’′]/;
// Marks that piece() reads without a pattern.
// Stryker disable next-line StringLiteral: without a mark here, the pattern in piece() reads it, only slower.
const MARKS = '’”−﹣′″‘“';
// A number run: digits, separators, slashes and Unicode fractions, with spaces between them.
const NUMBER_START = new RegExp(`[\\d.,/⁄${FRACTIONS}]`);
const NUMBER_RUN = new RegExp(`[\\d.,/⁄${FRACTIONS}\\s]+`, 'y');
// The next piece of the text where no number run starts: spaces, and then letters or other
// characters. Letters can have numerals after them, but not the digits and fractions that start
// a number run.
const PIECE = new RegExp(
  `(\\s*)(?:([\\p{L}\\p{M}_](?:[\\p{L}\\p{M}\\p{Nl}_]|(?![\\d${FRACTIONS}])\\p{N})*)|[^\\s\\p{L}\\p{M}_\\d.,/⁄${FRACTIONS}]+)?`,
  'uy'
);
const WORD_PART = /[\p{L}\p{M}\p{N}_]/u;

// The table: full-width forms, "㎝" and "㎏" become their ASCII forms. Primes and acute accents
// become "′" and "″", so they keep their unit.
const FORM = /[！-～㎝㎏´ʹʺ]/g;
const FORMS: Record<string, string> = { '´': '′', ʹ: '′', ʺ: '″' };

// The first number of the text: a digit, a Unicode fraction or a number word.
const NUMBER = new RegExp(String.raw`\d|[${FRACTIONS}]|\b(?:${NUMBER_WORD})\b`, 'i');
// A number right after a minus sign: digits, a Unicode fraction or a number word, also after "a"
// or "an", as in "−5", "−½", "−five'" and "−a hundred".
const SIGNED = new RegExp(
  String.raw`[.,]?\d|[${FRACTIONS}]|(?:an?[\s-]+)?(?:${NUMBER_WORD})\b`,
  'iy'
);
// A word that is a number word, at the end of the text.
const WORD_END = new RegExp(String.raw`(?:^|\W)(?:${NUMBER_WORD})$`, 'i');
// A unit that digits can follow, as in "5ft11" and "1.8m80" (AFA-62).
const UNIT = /^(?:ft|foot|feet|m|meters?|metres?)$/iu;

// A number in a fraction: digits with an optional decimal part, or a decimal part alone. The two
// forms can't overlap, so a long number that isn't a fraction fails in linear time.
const FRACTION_NUMBER = String.raw`(\d+(?:\.\d+)?|\.\d+)`;
// A whole number is optional. Without one, the numerator can't follow a letter or quote mark,
// even after spaces: there the slash separates two measurements, as in "5'10/180" and
// "5 ft 10/180 lbs". Punctuation breaks that context: fractions after a comma or bracket
// retain their ordinary meaning. Both slash characters block partial matches in dates/codes.
// The lookahead keeps the lookbehind from running at every space.
const SLASH_FRACTION = new RegExp(
  String.raw`(?<![\d/⁄.])(?:${FRACTION_NUMBER}\s+|(?=[\d.])(?<![\p{L}'"′″]\s*))${FRACTION_NUMBER}[/⁄]${FRACTION_NUMBER}(?![\d/⁄])`,
  'gu'
);
const UNICODE_FRACTION = new RegExp(
  String.raw`(?<![\d/.])(?:${FRACTION_NUMBER}\s*)?([${FRACTIONS}])(\d+)?`,
  'gu'
);
// Numerals and then a comma at the start of a run, which belong to a letter right before it.
const LABEL_NUMERALS = new RegExp(`^[\\d.${FRACTIONS}]*,`);
const COMMA_NUMBER = /[.,]?\d(?:[\d.,]*\d)?/g;

const digit = (code: number): boolean => code > 47 && code < 58;
const digitOrPeriod = (code: number): boolean => code === 46 || digit(code);
const asciiLetter = (code: number): boolean =>
  code === 95 || ((code | 32) > 96 && (code | 32) < 123);
// Digits between ASCII letters, as in "ft5ft" and "kg12lb".
// Stryker disable next-line Regex: a shorter match leaves the rest to the next pieces, which add it to the same word.
const DIGITS_AND_LETTERS = /(?:\d+[A-Za-z_]+)*/y;

/** Writes a fraction as a decimal, or as "x" when it isn't a proper fraction of whole numbers. */
function writeFraction(text: string, whole = '', numerator: string, denominator: string): string {
  const value = String(+whole + +numerator / +denominator);
  return +numerator < +denominator && !text.includes('.') && !value.includes('e') ? value : 'x';
}

/**
 * Write a run of number characters as the parser reads it. Comma groups lose their commas and a
 * decimal comma becomes a period, so "1,000" is 1000 and "72,5" is 72.5. A proper fraction
 * becomes a decimal, with the whole number before it, so "150 1/2" and "150½" are 150.5. Another
 * fraction becomes "x", so "5/2" can't be read as a value. A date such as "12/25/2020" stays.
 * `label` is true when a letter and only numerals come right before the run, as in "phase2,180":
 * the numerals and the comma at the start of the run then belong to the word. `quoted` is true when
 * the last character before the run, past spaces, is a letter or a quote mark. Return undefined
 * for a comma group of the wrong size, which rejects the whole input, so it can't leave a value.
 */
function readNumber(run: string, label: boolean, quoted: boolean): string | undefined {
  const skip = (label && LABEL_NUMERALS.exec(run)?.[0].length) || 0;
  let valid = true;
  const commas =
    run.slice(0, skip) +
    (skip ? run.slice(skip) : run).replace(COMMA_NUMBER, number => {
      // Commas outside the supported numeric group sizes remain punctuation.
      if (!/,\d{1,3}(?!\d)/.test(number)) return number;
      if (!/^(?:\d{1,3}(?:,\d{3})+|\d*)(?:,\d{1,2}|\.\d*)?$/.test(number)) {
        valid = false;
        // Stryker disable next-line StringLiteral: valid is false, so readNumber returns undefined and never uses this value (AFA-165).
        return '';
      }
      return number.replace(/,(?=\d{1,2}$)/, '.').replace(/,/g, '');
    });
  if (!valid) return undefined;
  const fractions = commas.replace(
    UNICODE_FRACTION,
    (text: string, whole: string | undefined, fraction: string, trailing: string | undefined) => {
      const [numerator, denominator] = fraction.normalize('NFKD').split('⁄');
      // Keep an invalid fragment as one non-number, including any following decimal tail.
      // Its period prevents it from owning a later slash fraction.
      return trailing || whole?.includes('.')
        ? 'x.'
        : writeFraction(text, whole, numerator, denominator);
    }
  );
  // The slash fractions see a letter before the run in place of the letter or quote mark.
  return (quoted ? 'a' : '')
    .concat(fractions)
    .replace(SLASH_FRACTION, writeFraction)
    .slice(+quoted);
}

// The state of the scan. tokenize calls no code outside this module, so one scan runs at a time.
// The helpers live here, not inside tokenize, so each call reuses the same compiled functions.
let text: string;
let tokens: Token[];
// The place in the converted text.
let place: number;
// The word or number being read, and its kind: 1 for a word, 2 for a number.
let token: string;
let kind: number;
// The text before, up to its last character that isn't a space.
let solid: string;
// Whether a letter and then only numerals come right before, as in "phase2" and "a²".
let label: boolean;
// Where the first number of the text starts, once a minus sign needs it.
let first: number | undefined;
// Where a unit ends that digits right after it don't join, as in "5ft11", "5ft.11" and "½m80".
let unitEnd: number;

function push(word: string): void {
  tokens.push({ text: word, start: place, end: (place += word.length) });
}

function close(): void {
  if (!kind) return;
  const word = kind === 1 ? token.toLowerCase() : token;
  const before = word[word.length - 1] === '.' ? word.slice(0, -1) : '';
  // A number word or complete decimal can precede a final period. Retain that period
  // as punctuation; only the cursor can accept it or reject it inside an expression.
  // Keep the established integer-with-decimal-point spelling ("72. kg") unchanged.
  if (
    before &&
    (NUMBER_WORDS.has(before) ||
      MULTIPLIERS.has(before) ||
      before === 'half' ||
      /^\d*\.\d+$/.test(before))
  ) {
    push(before);
    push('.');
  } else push(word);
  token = '';
  kind = 0;
}

/** Add digits and periods. A word takes the digits up to its first period, and that period. */
function number(digits: string): void {
  solid = digits;
  if (kind === 1) {
    const dot = digits.indexOf('.') + 1;
    if (!dot) {
      token += digits;
      return;
    }
    token += digits.slice(0, dot);
    close();
    digits = digits.slice(dot);
  }
  if (digits && kind !== 2) {
    close();
    kind = 2;
  }
  token += digits;
}

/**
 * Add one other character: one that readNumber writes, where "x" is the only letter, or one that
 * isn't a space, a letter or part of a number run, which can be a numeral such as "²".
 */
function put(character: string): void {
  if (kind === 1 && WORD_PART.test(character)) {
    token += character;
    return;
  }
  close();
  if (character === 'x') {
    kind = 1;
    token = character;
  }
  // A few characters that aren't letters have a lowercase form, as "Ⅻ" and "Ⓜ" do. None comes
  // before "Ⅰ", the first of them.
  // Stryker disable next-line ConditionalExpression: toLowerCase leaves each character before "Ⅰ" that isn't a letter as it is, so the test only saves the call, which is slow.
  else push(character < 'Ⅰ' ? character : character.toLowerCase());
}

function space(count: number): void {
  close();
  place += count;
  label = false;
}

/**
 * Whether the letters from start to end are a unit that digits right after don't join. The
 * number before the unit must start a word, as it does in "5ft11" and "½m80", but not in
 * "x5ft11" or "5.5.ft11".
 */
function unit(start: number, end: number): boolean {
  if (!'fFmM'.includes(text[start]) || !UNIT.test(text.slice(start, end))) return false;
  // The number and the Unicode fraction before the unit, as in "5", ".5", "1.75" and "5½".
  const fraction = start - +FRACTION.test(text[start - 1]);
  let number = fraction;
  let dots = 0;
  while (digitOrPeriod(text.charCodeAt(number - 1))) dots += +(text[--number] === '.');
  return (
    dots < 2 &&
    text[fraction - 1] !== '.' &&
    !(text.charCodeAt(number - 1) < 128
      ? /[\w.]/.test(text[number - 1])
      : /[\p{L}\p{M}\p{N}_.]$/u.test(text.slice(Math.max(0, number - 2), number)))
  );
}

/** Whether the text before `end` is a word that is a number word. */
function wordEnd(end: number): boolean {
  return WORD_END.test(text.slice(Math.max(0, end - 10), end));
}

/** Whether a curly quote at `at` follows a number or a number word, past spaces. */
function afterNumber(at: number): boolean {
  let end = at;
  while (SPACE.test(text[end - 1])) end--;
  const last = text[end - 1];
  if (DIGIT_OR_FRACTION.test(last) || (MARK.test(last) && DIGIT_OR_FRACTION.test(text[end - 2])))
    return true;
  // A letter after it makes it an apostrophe, as in "five’s".
  if (!/[a-z]/i.test(last) || /[a-z]/i.test(text[at + 1])) return false;
  if (wordEnd(end)) return true;
  // A number and "and a half", as in "6 and a half’" and "six-and-a-half”".
  for (const word of ['half', 'a', 'and']) {
    if (text.slice(end - word.length, end).toLowerCase() !== word) return false;
    const start = (end -= word.length);
    while (/[\s-]/.test(text[end - 1])) end--;
    if (end === start) return false;
  }
  return /\d/.test(text[end - 1]) || wordEnd(end);
}

/** Read the number run at `at`, and return where it ends. */
function readRun(at: number, run: string): number {
  let end = at + run.length;
  // A space separates a unit from the digits after it, after the unit's period if it has one.
  if (at === unitEnd && DIGIT_OR_FRACTION.test(run[+(run[0] === '.')])) {
    if (run[0] === '.') {
      number('.');
      run = run.slice(1);
    }
    space(1);
  }
  let read: string | undefined = run;
  if (/^[\d.]+$/.test(run)) number(run);
  else {
    read = readNumber(run, label, /[\p{L}'"′″]$/u.test(solid));
    // A comma group of the wrong size rejects the whole input: the scan ends with no tokens.
    if (read === undefined) {
      tokens = [];
      return Infinity;
    }
    label &&= NUMERALS.test(run);
    for (let start = 0, end = 0; start < read.length; start = end) {
      while (digitOrPeriod(read.charCodeAt(end))) end++;
      if (end > start) number(read.slice(start, end));
      else {
        while (SPACE.test(read[end])) end++;
        if (end > start) space(end - start);
        else put(read[end++]);
      }
    }
  }
  // Two marks right after a number are an inch mark, as in "72''", but a third keeps them.
  if (
    MARK.test(text[end]) &&
    MARK.test(text[end + 1]) &&
    !MARK.test(text[end + 2]) &&
    /\d$/.test(read)
  ) {
    close();
    push('″');
    solid = '″';
    label = false;
    end += 2;
  }
  return end;
}

/**
 * Add the character at `at` that isn't a space, a letter or part of a number run, and return
 * where it ends.
 */
function other(at: number): number {
  let character = String.fromCodePoint(text.codePointAt(at)!);
  const end = at + character.length;
  if (character === '−' || character === '﹣') {
    first ??= text.search(NUMBER);
    SIGNED.lastIndex = end;
    if (first >= end && SIGNED.test(text)) character = '-';
  } else if ((character === '’' || character === '”') && afterNumber(at)) {
    character = character === '’' ? "'" : '"';
  }
  put(character);
  solid = character;
  label &&= /\p{N}/u.test(character);
  return end;
}

/** Add the letters at `at`, and return where they end. */
function word(at: number, letters: string, isUnit: boolean): number {
  const end = at + letters.length;
  // "I’m" is one word, also before digits, which a space separates from the unit "m".
  if (
    kind !== 1 &&
    (letters === 'i' || letters === 'I') &&
    (text[end] === "'" || text[end] === '’') &&
    (text[end + 1] === 'm' || text[end + 1] === 'M') &&
    !/[a-z_]/.test(text[end + 2].toLowerCase())
  ) {
    close();
    push(text.slice(at, end + 2).toLowerCase());
    solid = 'm';
    label = true;
    // Its "m" is a unit, so digits after it don't join it.
    return (unitEnd = end + 2);
  }
  if (kind !== 1) close();
  kind = 1;
  token += letters;
  if (isUnit) unitEnd = end;
  solid = letters;
  label = true;
  return end;
}

/** Read the piece of the text at `at`, and return where it ends. */
function piece(at: number): number {
  const code = text.charCodeAt(at);
  // ASCII letters need no pattern to find them, unless a letter that isn't ASCII comes after them.
  // Digits between letters stay in the word, as in "ft5ft", unless a unit splits them.
  // Stryker disable next-line ConditionalExpression: the pattern below reads the same letters, only slower.
  if (asciiLetter(code)) {
    let end = at + 1;
    while (asciiLetter(text.charCodeAt(end))) end++;
    const isUnit = unit(at, end);
    // Stryker disable next-line ConditionalExpression,BlockStatement: without this, the next pieces read the same digits and letters, and add them to the same word.
    if (!isUnit && digit(text.charCodeAt(end))) {
      DIGITS_AND_LETTERS.lastIndex = end;
      // Stryker disable next-line CallExpression: without the match, the next pieces read the same digits and letters, and add them to the same word.
      DIGITS_AND_LETTERS.test(text);
      end = DIGITS_AND_LETTERS.lastIndex;
    }
    // Stryker disable next-line ConditionalExpression,EqualityOperator: the pattern below reads the same letters, and a letter that isn't ASCII after them.
    if (text.charCodeAt(end) < 128) return word(at, text.slice(at, end), isUnit);
  }
  // A digit, ",", ".", "/" or a character of a number run that isn't ASCII. Spaces after a run
  // aren't part of it, because they change nothing in it.
  if (code > 127 ? NUMBER_START.test(text[at]) : code > 43 && code < 58 && code !== 45) {
    NUMBER_RUN.lastIndex = at;
    NUMBER_RUN.test(text);
    // Stryker disable next-line MethodExpression: spaces at the end of a run change nothing in it, and readRun reads them as spaces.
    return readRun(at, text.slice(at, NUMBER_RUN.lastIndex).trimEnd());
  }
  if (code === 32) {
    let end = at + 1;
    while (text.charCodeAt(end) === 32) end++;
    space(end - at);
    return end;
  }
  // One ASCII punctuation character: the other ASCII characters are spaces, and letters before a
  // letter that isn't ASCII.
  if (code < 128 && !asciiLetter(code) && (code < 9 || code > 13)) {
    close();
    push(text[at]);
    solid = text[at];
    label = false;
    return at + 1;
  }
  // Stryker disable next-line ConditionalExpression: the pattern below reads each mark too, only slower.
  if (MARKS.includes(text[at])) return other(at);
  PIECE.lastIndex = at;
  const [, spaces, letters] = PIECE.exec(text)!;
  if (spaces) space(spaces.length);
  at += spaces.length;
  if (letters) return word(at, letters, unit(at, at + letters.length));
  while (at < PIECE.lastIndex) at = other(at);
  return at;
}

/**
 * Split the input into tokens in one scan from left to right. Spaces separate tokens. A word
 * starts with a letter and can end with one period. A number is a run of digits and periods. Each
 * other character is a token of its own.
 *
 * The scan converts each character as it reads it. Full-width forms, "㎝", "㎏", primes and acute
 * accents become their ASCII or prime forms, so "５’１１”" reads like 5'11". A minus sign is a
 * sign, "-", when no number or number word comes before it, as in "−5 ft". After a number it
 * joins two parts or values, as in "1 m−80 cm". A curly closing quote after a number or a number
 * word is a feet or inch mark, as in "5’11”" and "five’ ten”". Two marks right after a number are
 * an inch mark, as in "72''", but a third keeps them. A unit right before digits ends a word, as
 * in "5ft11" (AFA-62). readNumber writes each run of number characters. A comma group of the
 * wrong size rejects the whole input, so the result is no tokens.
 */
export function tokenize(input: string): Token[] {
  // A line end after the text keeps each scan inside it, and changes no token.
  text = `${input.replace(FORM, form => FORMS[form] ?? form.normalize('NFKC'))}\n`;
  tokens = [];
  place = kind = 0;
  token = solid = '';
  label = false;
  first = undefined;
  unitEnd = -1;
  for (let at = 0; at < text.length; ) at = piece(at);
  text = '';
  return tokens;
}
