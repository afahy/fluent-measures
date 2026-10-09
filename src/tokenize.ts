import { matchUnit } from './matchUnit';
import { LABEL_ALIASES, UNIT_ALIASES } from './units';
import { MULTIPLIERS, NUMBER_WORDS, wordsToNumber } from './wordsToNumber';

/** A word, number, mark or semicolon of the input. */
export interface Token {
  text: string;
  /**
   * The kind of label that the token is, if it's one. A short alias before ":" or "=" names a field,
   * as in "in: 72" and "age 28 (in): 180 lbs". Any other label is a unit label, as in "(kg)",
   * "in." and "kg: 72". A label's value can come after it, as in "age=28, in=72". A unit label can
   * also be the unit of the number before it, as in "72 (in), 180 lbs" and "180 lbs = 82 kg".
   */
  label?: 'name' | 'unit';
  /**
   * Whether the label starts a new field, after a comma, semicolon, colon, equals sign or "&", as in
   * "age=28, in=180 lbs". The label can't take the number before it, because that number belongs
   * to the field before it.
   */
  startsField?: boolean;
  /** The number of minus signs at the start of the text, as in "-5" and "--12". */
  sign?: number;
  /**
   * What a hyphen does that the scan removed before the token. "range": the token takes the place
   * of a range of numbers, as in "5-11 kg". "part": the hyphen joins two parts of a measurement, as
   * in "5'-11", "5 ft-11" and the bare height "5-11". "word": it joins two words, as in
   * "six-foot-two".
   */
  joiner?: 'range' | 'part' | 'word';
  /** Whether a measurement has used the token. The parser sets it. */
  used?: boolean;
}

// The Unicode fractions ¼ to ¾, ⅐ to ⅞ and ↉, as the inside of a character class.
const FRACTIONS = '¼-¾⅐-⅞↉';
// The number words, as alternatives in a pattern.
const NUMBER_WORD = [...NUMBER_WORDS.keys(), ...MULTIPLIERS.keys()].join('|');

// The scan reads full-width forms, "㎝", "㎏", primes and acute accents as these characters.
const FORM = /[！-～㎝㎏′´″]/g;
const FORMS: Record<string, string> = { '′': "'", '´': "'", '″': '"' };

// Where the scan stops: minus signs, curly quotes, and the characters of a number other than
// spaces. Each run of minus signs or curly quotes is one stop.
const STOP = new RegExp(`[−﹣]+|[’”]+|[\\d.,/⁄${FRACTIONS}]`, 'g');
// The characters of a number: digits, separators, slashes, Unicode fractions and spaces.
const NUMBER_CHARS = new RegExp(`[\\d.,\\s/⁄${FRACTIONS}]*`, 'y');
const DIGIT_OR_FRACTION = new RegExp(`[\\d${FRACTIONS}]`);
// The first number of the text: a digit, a Unicode fraction or a number word.
const NUMBER = new RegExp(`\\d|[${FRACTIONS}]|\\b(?:${NUMBER_WORD})\\b`, 'i');
// A number after a minus sign: digits, a Unicode fraction or a number word, also after "a" or
// "an", as in "−5", "−½", "−five'" and "−a hundred".
const SIGNED = new RegExp(`[.,]?\\d|[${FRACTIONS}]|(?:an?[\\s-]+)?(?:${NUMBER_WORD})\\b`, 'iy');

// After a word, its digits and the comma after them, as in "phase2,180", aren't a number.
const WORD_DIGITS = new RegExp(`^[\\d.${FRACTIONS}]*,`);
// A number with a comma in it, as in "1,000" and "72,5".
const COMMA_NUMBER = /[.,]?\d(?:[\d.,]*\d)?/g;
// A Unicode fraction, with a whole number right before it, or alone. A whole number without a
// fraction matches too, so the next match can't start inside it.
const UNICODE_FRACTION = new RegExp(`(\\d+)(\\s*)([${FRACTIONS}])|\\d+|([${FRACTIONS}])`, 'g');
// A number in a fraction: digits with an optional decimal part, or a decimal part alone.
const FRACTION_NUMBER = String.raw`(\d+(?:\.\d+)?|\.\d+)`;
// A fraction with a slash, with a whole number and spaces before it, or alone. Digits and periods
// without a fraction match too, so the next match can't start inside them.
const SLASH_FRACTION = new RegExp(
  String.raw`(?:${FRACTION_NUMBER}(\s+))?${FRACTION_NUMBER}[/⁄]${FRACTION_NUMBER}(?![\d/])|[\d.]+`,
  'g'
);

/** Writes a fraction as a decimal, or as "x" when it isn't a proper fraction of whole numbers. */
function writeFraction(text: string, whole = '', numerator: string, denominator: string): string {
  const value = String(+whole + +numerator / +denominator);
  return +numerator < +denominator && !text.includes('.') && !value.includes('e') ? value : 'x';
}

/**
 * Read a run of number characters. Comma groups lose their commas and a decimal comma becomes a
 * period, so "1,000" is 1000 and "72,5" is 72.5. A comma group of the wrong size makes the whole
 * input invalid, so it returns undefined. A proper fraction becomes a decimal, with the whole number
 * before it, so "150 1/2" and "150½" are 150.5. Other numbers with a slash between them become "x",
 * with their whole number, so "5/2" can't be read as a value. So does a fraction with a decimal in
 * it, or one whose value needs an exponent. A date such as "12/25/2020" has two slashes and stays
 * as it is. `word` is true when a word and only digits come right before the run, as in "phase2"
 * before ",180". `letter` is true when a letter or a quote mark comes right before it.
 */
function readNumber(run: string, word: boolean, letter: boolean): string | undefined {
  // Stryker disable next-line Regex: the replacements below find no comma, fraction or slash.
  if (!/[,/⁄¼-¾⅐-⅞↉]/.test(run)) return run;
  const skip = (word && WORD_DIGITS.exec(run)?.[0].length) || 0;
  let valid = true;
  const commas =
    run.slice(0, skip) +
    run.slice(skip).replace(COMMA_NUMBER, number => {
      // Commas outside the supported group sizes are punctuation.
      if (!/,\d{1,3}(?!\d)/.test(number)) return number;
      valid &&= /^(?:\d{1,3}(?:,\d{3})+|\d*)(?:,\d{1,2}|\.\d*)?$/.test(number);
      return number.replace(/,(?=\d{1,2}$)/, '.').replace(/,/g, '');
    });
  // A malformed number rejects the whole input, so it can't leave a value.
  if (!valid) return undefined;
  const unicode = commas.replace(
    UNICODE_FRACTION,
    (text: string, whole?: string, space?: string, fraction?: string, alone?: string, at = 0) => {
      const [numerator, denominator] = (fraction ?? alone ?? '0').normalize('NFKD').split('⁄');
      // A number can't start right after a digit, a slash or a period. A fraction after a space can.
      if (!/[\d/.]/.test(commas[at - 1] ?? '')) {
        return fraction || alone ? writeFraction(text, whole, numerator, denominator) : text;
      }
      return space ? whole + space + writeFraction('', '', numerator, denominator) : text;
    }
  );
  return unicode.replace(
    SLASH_FRACTION,
    (
      text: string,
      whole?: string,
      space?: string,
      numerator?: string,
      denominator = '',
      at = 0
    ) => {
      if (numerator === undefined) return text;
      if (/[\d/.]/.test(unicode[at - 1] ?? '')) {
        return whole ? whole + space + writeFraction(text, '', numerator, denominator) : text;
      }
      if (whole) return writeFraction(text, whole, numerator, denominator);
      // Without a whole number, a fraction after a letter or quote mark, even after spaces, isn't
      // one. The slash separates two measurements there, as in "5'10/180" and "5 ft 10/180 lbs".
      let before = at;
      while (/\s/.test(unicode[before - 1] ?? '')) before--;
      return (before ? /[\p{L}'"]/u.test(unicode[before - 1]) : letter)
        ? text
        : writeFraction(text, '', numerator, denominator);
    }
  );
}

/**
 * Convert the text in one scan from left to right, and return it in lowercase, with the places of
 * the range boundaries, and whether it's a bare height. Full-width forms, "㎝", "㎏", primes and
 * acute accents become their ASCII forms, so "５’１１”" reads like 5'11". A minus sign before a
 * number is a sign when no number or number word comes before it, as in "−5 ft". After a number, it
 * joins two parts or values, as in "1 m−80 cm". A curly quote after a number is a feet or inch
 * mark, unless it closes a quote that opens right before the number, as in "“180” cm". Two
 * apostrophes after a number are an inch mark, as in "72''" (AFA-106). readNumber reads each number.
 * For the parser, each range, as in "5-11 kg", becomes " - ". A bare height, as in "5-11", stays.
 * Return undefined when a number rejects the whole input.
 */
function readText(
  input: string,
  parser: boolean
): [text: string, ranges: Set<number>, bare: boolean] | undefined {
  const text = input.replace(FORM, form => FORMS[form] ?? form.normalize('NFKC'));
  const ranges = new Set<number>();
  let bare = false;
  let out = '';
  // The last two characters of the converted text, before lowercase.
  let cased = '';
  // Whether the last quote mark or space is the second of two quote marks that open a quotation.
  let open = false;
  // Where the first number of the text starts, once a minus sign needs it.
  let first: number | undefined;
  // A word and its digits can't reach back past here, because a number run ends here.
  let stop = 0;
  let runStart = -1;
  let runEnd = -1;
  const write = (piece: string): void => {
    const all = cased + piece;
    const quote = /['’\s][^'’\s]*$/.exec(all);
    if (quote && quote.index >= cased.length) {
      const at = quote.index;
      open =
        /['’]/.test(all[at]) &&
        /['’]/.test(all[at - 1] ?? '') &&
        !/[\w'"’]/.test(all[at - 2] ?? '');
    }
    cased = all.slice(-2);
    out += piece.toLowerCase();
  };

  for (let at = 0; at < text.length; ) {
    STOP.lastIndex = at;
    const match = STOP.exec(text);
    const piece = match?.[0] ?? '';
    let start = match?.index ?? text.length;
    const number = match && !/[−﹣’”]/.test(piece);
    // The spaces before a number belong to its run, as in "5 ½".
    while (number && start > at && /\s/.test(text[start - 1])) start--;
    write(text.slice(at, start));
    if (!match) break;
    at = match.index + piece.length;
    if (!number) {
      // Only the last minus sign of a run can come before a number.
      if (/[−﹣]/.test(piece)) {
        first ??= text.search(NUMBER);
        SIGNED.lastIndex = at;
        const signed = (first < 0 || first >= at) && SIGNED.test(text);
        write(piece.slice(0, -1) + (signed ? '-' : piece.slice(-1)));
        continue;
      }
      // Only the first two curly quotes of a run can follow a number.
      let marks = '';
      for (let mark = match.index; mark < Math.min(at, match.index + 2); mark++) {
        const [before, previous] = [text[mark - 1] ?? '', text[mark - 2] ?? ''];
        const curly = text[mark];
        const afterNumber = DIGIT_OR_FRACTION.test(before);
        const closes =
          afterNumber && runEnd === mark && text[runStart - 1] === (curly === '’' ? '‘' : '“');
        marks +=
          (afterNumber ||
            (curly === '’' && /['’]/.test(before) && DIGIT_OR_FRACTION.test(previous))) &&
          (!closes || /\d/.test(text[mark + 1] ?? ''))
            ? curly === '’'
              ? "'"
              : '"'
            : curly;
      }
      write(marks + piece.slice(2));
      continue;
    }
    NUMBER_CHARS.lastIndex = at;
    NUMBER_CHARS.exec(text);
    let end = NUMBER_CHARS.lastIndex;
    let run = text.slice(start, end);
    const word = WORD_DIGITS.test(run) && /[\p{L}\p{M}_][\p{N}.]*$/u.test(text.slice(stop, start));
    if (/[^\d.¼-¾⅐-⅞↉]/.test(run)) stop = end;
    const read = readNumber(run, word, /[\p{L}'"]$/u.test(cased));
    if (read === undefined) return undefined;
    runStart = start;
    runEnd = end;
    // For the parser, a range of numbers, as in "5-11" and "1.5 – 2", is one boundary. So neither
    // number becomes a measurement. The rest of a range's last run can start another range.
    let rest = read;
    for (let tail; parser && (tail = /[\d.]+\s*$/.exec(rest)); ) {
      const dashAt = end;
      let count = 0;
      let last = '';
      for (let more = true; more; ) {
        const dash = String.fromCodePoint(text.codePointAt(end) ?? 32);
        if (!/\p{Dash}/u.test(dash)) break;
        NUMBER_CHARS.lastIndex = end + dash.length;
        NUMBER_CHARS.exec(text);
        run = text.slice(end + dash.length, NUMBER_CHARS.lastIndex);
        const after = run && readNumber(run, false, false);
        if (after === undefined) return undefined;
        const head = /^\s*[\d.]+/.exec(after);
        if (!head) break;
        count++;
        last = after;
        runStart = end + dash.length;
        runEnd = end = NUMBER_CHARS.lastIndex;
        more = !after.slice(head[0].length).trim();
      }
      if (!count) break;
      // A bare height, as in "5-11", is the whole input: whole feet, a hyphen and the inches.
      if (
        count === 1 &&
        start === 0 &&
        end === text.length &&
        text[dashAt] === '-' &&
        /^\d+$/.test(rest) &&
        /^(?:\d*\.)?\d+$/.test(last)
      ) {
        bare = true;
        rest = `${rest}-${last}`;
        break;
      }
      write(rest.slice(0, tail.index));
      ranges.add(out.length + 1);
      write(' - ');
      rest = last.replace(/^\s*[\d.]+/, '');
    }
    write(rest);
    at = end;
    if (/\d$/.test(cased)) {
      // Two apostrophes after a number are an inch mark, as in "72''", but a third keeps them, as
      // in "72'''". They don't close a quote that two apostrophes open, as in "the ''5'' kg bag".
      // A curly quote is an apostrophe here when it doesn't close a quote, as in "72’’".
      if (
        /^['’]['’](?!['’])/.test(text.slice(at, at + 3)) &&
        (text[at] === "'" || text[runStart - 1] !== '‘') &&
        !open
      ) {
        write('"');
        at += 2;
      } else if (text[at] === 'G' && !/[A-Za-z]/.test(text[at + 1] ?? '')) {
        // A capital G right after a number, as in "5G phone", is a network generation, not grams.
        write('gen');
        at++;
      }
    }
  }
  return [out, ranges, bare];
}

// The unit aliases that can be labels, as in "(kg)", "m:", "in = 72" and "("):".
const LABELS = new Set(Object.values(UNIT_ALIASES).flat(2));
const ALIAS = /['"]|[a-z]+/y;
// The end of a label: a closing bracket, then maybe ":" or "=". Or ":" or "=". Or, for "in", a
// period and a space.
const BRACKET_END = /\.?\s*[)\]](\s*[:=])?/y;
const ASSIGN_END = /\.?\s*[:=]/y;
const PERIOD_END = /\.(?:\s|$)/y;
// Before a mark and a hyphen: a number or a number word, then spaces, semicolons or a word that
// ends in digits, as in "5 '-11", "5ft11\"-5" and "five'-10\"". The number must start a token.
const NUMBER_MARK = /(?:^|[^\w.-])[\d.]*\d[\s;]*(?:[a-z]+[\d.]*\d)?$/;
const WORD_MARK = new RegExp(String.raw`\b(?:${NUMBER_WORD})[\s;]*(?:[a-z]+[\d.]*\d)?$`);
// A number word right before a mark, as in "five'", or "and a half" after a number or a number
// word, as in "10 and a half\"" and "six-and-a-half'".
const WORD_END = new RegExp(String.raw`\b(?:${NUMBER_WORD})$`);
const HALF_END = new RegExp(String.raw`(?:\d|\b(?:${NUMBER_WORD}))[\s-]+and[\s-]+a[\s-]+half$`);
// The next piece of the text: letters, digits and periods, a mark, hyphens, a semicolon, spaces,
// "#", "_", or punctuation.
const PIECE = /([a-z]+)|([\d.]+)|(['"])|(-+)|(;)|\s+|(#)|(_)|[^\w\s'".;-]+/y;

/**
 * Split the input into tokens in one scan from left to right, after readText converts it. Spaces,
 * semicolons and punctuation separate tokens, and each semicolon is a token. A number and a unit
 * or mark after it are two tokens, as in "180cm" and "5'11\"". Each hyphen gets one role: the sign
 * of the token that it starts, a range, or a joiner of two parts or two words, which separates
 * them. With `parser` true, as parseMeasurement calls it, each range of numbers is one boundary
 * token, as in "5-11 kg", and a bare height, as in "5-11" or "five-eleven", gives its feet and
 * inches. Without it, the tokens of "5-11" are "5" and "11".
 */
export function tokenize(input: string, fuzziness?: number, parser = false): Token[] {
  const read = readText(input, parser);
  if (!read) return [];
  const [text, ranges, bare] = read;
  const tokens: Token[] = [];
  let word = '';
  let props: Omit<Token, 'text'> = {};
  const push = (): void => {
    if (word) {
      // Only the periods at the end of a token go, as in "kg." (AFA-36).
      let end = word.length;
      while (word[end - 1] === '.') end--;
      const token: Token = { text: word.slice(0, end), ...props };
      let sign = 0;
      while (word[sign] === '-' && !props.joiner) sign++;
      if (sign) token.sign = sign;
      tokens.push(token);
      props = {};
    }
    word = '';
  };
  // The character before. A separator other than a hyphen reads as a space.
  let last = '';
  // Whether that is a hyphen that joins two values after a mark.
  let removed = false;
  // The chunks between spaces, semicolons and punctuation, for a unit and a hyphen.
  let chunk = 0;
  let previous = '';
  // Where the text before "and a half" can start.
  let half = 0;
  // Whether the last quote mark of each kind opens a quotation.
  const opens: Record<string, boolean> = {};
  // Whether the hyphen after the last mark joins two values.
  let joins = false;
  // A hyphen after a unit with a number before it, as in "5 ft-11". It joins two parts.
  let part = -1;

  const separate = (at: number, to: number, hyphen = false): void => {
    push();
    if (at > chunk) previous = text.slice(chunk, at);
    chunk = to;
    removed = hyphen;
    last = hyphen ? '-' : ' ';
  };
  // The text before a mark from the last character that can't be part of a number before it, its
  // spaces or its word, as in "5 ft11".
  const before = (at: number): string => {
    let start = at;
    while (/[a-z\d.\s;]/.test(text[start - 1] ?? '')) start--;
    return text.slice(Math.max(start - 1, 0), at);
  };
  // The character before a position, past spaces, and where it is.
  const solid = (at: number): [string, number] => {
    while (/\s/.test(text[at - 1] ?? '')) at--;
    return [text[at - 1] ?? '', at - 1];
  };
  const labelAt = (
    at: number
  ): [end: number, alias: string, kind: 'name' | 'unit', field: boolean] | undefined => {
    ALIAS.lastIndex = at;
    const [name = ''] = ALIAS.exec(text) ?? [];
    const end = at + name.length;
    if (!LABELS.has(name) || !/[.\s)\]:=]/.test(text[end] ?? '')) return undefined;
    const short = LABEL_ALIASES.get(name);
    let [character, place] = solid(at);
    BRACKET_END.lastIndex = ASSIGN_END.lastIndex = PERIOD_END.lastIndex = end;
    const bracket = /[([]/.test(character) && BRACKET_END.exec(text);
    let assign = !!bracket && !!bracket[1];
    if (bracket) [character] = solid(place);
    // The alias must be a word of its own, so "check-in: 5" and "µm: 5" have no label.
    else if (
      /[\p{L}\p{M}\p{N}_\p{Dash}]$/u.test(text.slice(Math.max(at - 2, 0), at)) ||
      !((assign = ASSIGN_END.test(text)) || (name === 'in' && PERIOD_END.test(text)))
    ) {
      return undefined;
    }
    return [end, short ?? name, short && assign ? 'name' : 'unit', /[,;:=&]/.test(character)];
  };

  for (let j = 0; j < text.length; ) {
    PIECE.lastIndex = j;
    const [piece, letters, numbers, mark, hyphen, semicolon, hash, underscore] = PIECE.exec(text)!;
    let end = j + piece.length;
    const label = (letters || mark) && labelAt(j);
    if (label) {
      const [labelEnd, alias, kind, startsField] = label;
      // A label right after a period or a quote mark doesn't stand alone, so it's a word.
      if (word) {
        word += kind.toUpperCase();
        push();
      } else props = { label: kind, startsField };
      word = alias;
      if (mark) opens[mark] = true;
      last = text[labelEnd - 1];
      removed = false;
      j = labelEnd;
      continue;
    }
    const ahead = text.slice(end, end + 2);
    if (letters) {
      // After a word that isn't a number, a unit and a hyphen before a number are the unit and the
      // sign of that number, as in "kg-70.5". After a number, the hyphen joins two parts or values,
      // as in "5 ft-11", "1 m-80 cm" and "150 lbs-180 lbs".
      if (
        !(/\w/.test(last) || (last === '-' && !removed)) &&
        /^-\.?\d/.test(text.slice(end, end + 3)) &&
        (matchUnit(letters, 'height', fuzziness) || matchUnit(letters, 'weight', fuzziness))
      ) {
        const chunkText = chunk < j ? text.slice(chunk, j) : previous;
        // Stryker disable next-line StringLiteral: any text that isn't a number gives null, as "" does.
        if (wordsToNumber(/^[a-z\d.]*$/.test(chunkText) ? chunkText : '') === null) {
          word += letters;
          push();
          word = '-';
          last = '-';
          removed = false;
          j = end + 1;
          continue;
        }
        part = end;
      }
      // A word after a number starts a new token, as in "180cm".
      if (/\d/.test(last)) push();
    } else if (numbers) {
      // A number after a mark starts a new token, as in "5'11".
      if (/['"]/.test(last) && /^\.?\d/.test(piece)) push();
      if (piece.includes('.')) half = j + piece.lastIndexOf('.') + 1;
    } else if (mark) {
      // A mark after a number, a number word or "and a half" starts a new token, as in "5'",
      // "five' ten\"" (AFA-93) and "10 and a half\"". After a word, no letter may follow it, as in
      // "one's", and it mustn't close a quotation, as in "\"twenty five\" 5".
      if (
        /\d/.test(last) ||
        (/[a-z]/.test(last) &&
          !opens[mark] &&
          (!/[a-z]/.test(ahead[0] ?? '') || labelAt(end)) &&
          (WORD_END.test(before(j)) ||
            HALF_END.test(text.slice(half, j).replace(/_(?=-)|[^\w\s'".;-]/g, ' '))))
      ) {
        push();
      }
      if (ahead[0] === '-') {
        joins = NUMBER_MARK.test(before(j)) || (!opens[mark] && WORD_MARK.test(before(j)));
      }
      opens[mark] = !/[\w'"]/.test(last);
      // Only the last mark of a run can start a label or come before a hyphen.
      while (/['"]/.test(text[end] ?? '') && /['"]/.test(text[end + 1] ?? '')) {
        opens[text[end++]] = false;
      }
      half = end;
    } else if (hyphen === '-' && ranges.has(j)) {
      props = { joiner: 'range' };
    } else if (hyphen === '-') {
      if (/['"]/.test(last) && joins && /^(?:\.?\d|[a-z])/.test(ahead)) {
        // After a feet or inch mark after a number, a hyphen joins two values, as in "5'-11",
        // "5'-eleven" and "five'-10\"" (AFA-112).
        separate(j, end, true);
        props = { joiner: 'part' };
        j = end;
        continue;
      }
      // After a mark, a hyphen is the sign of the number after it, as in "x'-5".
      if (/['"]/.test(last) && /^\.?\d/.test(ahead)) push();
      else if (/\w/.test(last) && /^(?:\.\d|[a-z\d]|_(?!-))/.test(ahead)) {
        // A hyphen between two words or numbers joins them, as in "six-foot-two". For the parser,
        // in a bare height, as in "5-11" or "five-eleven", it joins the feet and the inches.
        const rest = text.slice(end);
        const feet = bare ? word : `${NUMBER_WORDS.get(word)}`;
        if (
          parser &&
          word === text.slice(0, j) &&
          (bare || (+feet > 2 && +feet < 9 && NUMBER_WORDS.has(rest)))
        ) {
          return [
            { text: feet },
            { text: bare ? rest : `${NUMBER_WORDS.get(rest)}`, joiner: 'part' },
          ];
        }
        push();
        props = { joiner: part === j ? 'part' : 'word' };
        last = '-';
        removed = false;
        j = end;
        continue;
      }
    } else if (!hyphen && !(underscore && ahead[0] !== '-')) {
      // Spaces, a semicolon, punctuation, or "_" before a hyphen separate tokens. "#" right after
      // a number means pounds, as in "185#". Before a letter, a digit or another "#", as in
      // "185#kg" and "12#3", it isn't a unit. Nor is it before a label, as in "5#':".
      const pound =
        hash &&
        /\d/.test(last) &&
        !/[\p{L}\p{N}_#]/u.test(String.fromCodePoint(text.codePointAt(end) ?? 32)) &&
        !(/['"]/.test(ahead[0] ?? '') && labelAt(end));
      separate(j, end);
      if (semicolon || pound) {
        tokens.push({ text: pound ? 'lb' : ';' });
        if (pound) previous = 'lb';
        half = end;
      }
      j = end;
      continue;
    }
    word += text.slice(j, end);
    last = text[end - 1];
    removed = false;
    j = end;
  }
  push();
  return tokens;
}
