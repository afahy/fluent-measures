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
  /** Whether a measurement has used the token. The parser sets it. */
  used?: boolean;
}

// Until its last step, the tokenizer works on text. So it writes one of these words before each
// label, to record what kind of label it is. The text is lowercase by then, so no input word can be
// one of them. The last step moves them into the fields of the label's token.
const NAME_WORD = 'NAME';
const UNIT_WORD = 'UNIT';
const FIELD_WORD = 'FIELD';

// A unit alias in brackets or before a colon or equals sign, as in "(kg)", "m:", "in = 72" and
// "("):", is a label. So is "in." followed by a space, the usual abbreviation for inches. The alias must
// be a word of its own, so "check-in: 5" isn't a label, with any kind of hyphen or dash, and
// neither is "µm: 5" after any Unicode letter. The opening bracket is matched forward: some
// engines run a lookbehind such as `(?<=\(\s*)` in quadratic time across a long run of spaces.
// For the same reason, a field separator before the label is matched forward too.
const LABELS = Object.values(UNIT_ALIASES).flat(2).join('|');
const WORD_BEFORE = '(?<![\\p{L}\\p{M}\\p{N}_\\p{Dash}])';
const LABEL_PATTERN = new RegExp(
  `([,;:=&]\\s*)?(?:([([]\\s*)(${LABELS})(?=\\.?\\s*[)\\]](\\s*[:=])?)|${WORD_BEFORE}(${LABELS})(?=\\.?\\s*[:=])|${WORD_BEFORE}in(?=\\.(?:\\s|$)))`,
  'gu'
);

// A number in a fraction: digits with an optional decimal part, or a decimal part alone. The two
// forms can't overlap, so a long number that isn't a fraction fails in linear time.
const FRACTION_NUMBER = String.raw`(\d+(?:\.\d+)?|\.\d+)`;
// A whole number is optional. Without one, the numerator can't follow a letter or quote mark,
// even after spaces: there the slash separates two measurements, as in "5'10/180" and
// "5 ft 10/180 lbs". The lookahead keeps that lookbehind from running at every space.
const SLASH_FRACTION = new RegExp(
  String.raw`(?<![\d/.])(?:${FRACTION_NUMBER}\s+|(?=[\d.])(?<![\p{L}'"]\s*))${FRACTION_NUMBER}[/⁄]${FRACTION_NUMBER}(?![\d/])`,
  'gu'
);

/** Writes a fraction as a decimal, or as "x" when it isn't a proper fraction of whole numbers. */
function writeFraction(text: string, whole = '', numerator: string, denominator: string): string {
  const value = String(+whole + +numerator / +denominator);
  return +numerator < +denominator && !text.includes('.') && !value.includes('e') ? value : 'x';
}

/**
 * Removes each copy of a mark from the end of a text. A scan back from the end takes linear time.
 * A regex such as `/\.+$/` starts again at each character of a long run, so it takes quadratic time.
 */
function trimTrailing(text: string, mark: string): string {
  let end = text.length;
  while (text[end - 1] === mark) end--;
  return text.slice(0, end);
}

// The Unicode fractions ¼ to ¾, ⅐ to ⅞ and ↉, as the inside of a character class.
const FRACTIONS = '¼-¾⅐-⅞↉';
const UNICODE_FRACTION = new RegExp(String.raw`(?<![\d/.])(?:(\d+)\s*)?([${FRACTIONS}])`, 'gu');

/**
 * Write each proper fraction as a decimal, so "150 1/2" and "150½" are 150.5. A whole number
 * before the fraction is part of it. Other numbers with a slash between them become "x", with
 * their whole number, so "5/2" and "150 5/2" can't be read as a value. So does a fraction with a
 * decimal in it, or one whose result needs an exponent. A date such as "12/25/2020" has two
 * slashes and stays as it is. Run this after normalizeNumericCommas, so "1,000 1/2" is 1000.5.
 */
export function normalizeFractions(input: string): string {
  return input
    .replace(UNICODE_FRACTION, (text: string, whole: string | undefined, fraction: string) => {
      const [numerator, denominator] = fraction.normalize('NFKD').split('⁄');
      return writeFraction(text, whole, numerator, denominator);
    })
    .replace(SLASH_FRACTION, writeFraction);
}

// A number as it can stand in quotes: digits, separators, spaces, slashes and fractions.
const QUOTED_NUMBER = String.raw`[\d.,\s/⁄${FRACTIONS}]*[\d${FRACTIONS}]`;
// A single or double curly mark right after a number. It closes a quoted number only when its
// opening quote comes right before that number and no digit follows, as in "“5 1/2” ft".
const CURLY_SINGLE = new RegExp(
  String.raw`(?<=[\d${FRACTIONS}]['’]?)(?:(?<!‘${QUOTED_NUMBER})’|’(?=\d))`,
  'g'
);
const CURLY_DOUBLE = new RegExp(
  String.raw`(?<=[\d${FRACTIONS}])(?:(?<!“${QUOTED_NUMBER})”|”(?=\d))`,
  'g'
);

// The number words, as alternatives in a pattern.
const NUMBER_WORD = [...NUMBER_WORDS.keys(), ...MULTIPLIERS.keys()].join('|');

// A minus sign before a number, when no number comes earlier: no digit, Unicode fraction or number
// word. The number can be a word too, as in "−five'", also after "a" or "an", as in "−a hundred"
// and "−a-hundred". After a number, a minus sign joins two parts or values, as in "1 m−80 cm" and
// "½ lb−180 lbs". The parser would read a hyphen-minus there as a sign. The lookbehind runs only
// after a minus sign, and its lazy part stops at the nearest earlier number.
const MINUS_SIGN = new RegExp(
  String.raw`[−﹣](?=[.,]?\d|[${FRACTIONS}]|(?:an?[\s-]+)?(?:${NUMBER_WORD})\b)(?<!(?:[\d${FRACTIONS}]|\b(?:${NUMBER_WORD})\b)[\s\S]*?.)`,
  'gi'
);

// The places where a space separates two tokens. One is between a number and an attached unit or
// quote mark. Another is between a quote mark and the number after it, which keeps a sign after an
// opening quote. A word hyphen is a third, so "six-foot-two" becomes "six foot two". A number word
// is a number too, as in "five' ten\"" (AFA-93), but not inside a word, as in "tone'". "half"
// counts only after a number and "and a", as in "10 and a half\"" and "six-and-a-half'". No letter
// may follow the mark, as in "one's". A mark that closes a quotation isn't split, as in
// "\"twenty five\" 5" and "\"it's five\"": OPEN starts a quotation, and no quote of the same kind
// comes between. The lookahead comes first, so each lookbehind runs only before a quote mark.
const OPEN = String.raw`(?:^|[^\w'"])`;
const SPLIT = new RegExp(
  String.raw`(?<=\d)(?=[a-z'"])|(?=['"](?![a-z]))(?:(?=")(?<!${OPEN}"[^"]*)|(?=')(?<!${OPEN}'[^']*))(?<=\b(?:${NUMBER_WORD})|(?:\d|\b(?:${NUMBER_WORD}))[\s-]+and[\s-]+a[\s-]+half)|(?<=['"])(?=-?\.?\d)|(?<!-)\b-(?=\b|\.\d)`,
  'g'
);

// Punctuation, a hyphen after a feet or inch mark after a number, and an underscore before a minus
// sign. After a mark, a hyphen joins two values as it does after a unit word (AFA-112). So a
// semicolon may come before the mark, and a word may follow the hyphen, as in "5'-eleven". The
// number before the mark must start a token. Digits can also follow that number, or a number
// word, and a word when the mark touches them, as in "5ft11\"", "5 ft11\"" and "five;ft11\"". So
// "x11\"-5 in", "abc5ft11\"-5 in" and the second hyphen of "5\"-5\"-5\"" stay minus signs. After a
// number word, the mark mustn't close a quotation, as in "\"ten\"-5 kg".
const PUNCTUATION = new RegExp(
  String.raw`(?<=(?:^|[^\w.-])[\d.]*\d[\s;]*(?:[a-z]+[\d.]*\d)?['"])-(?=\.?\d|[a-z])|(?<=\b(?:${NUMBER_WORD})[\s;]*(?:[a-z]+[\d.]*\d)?['"])(?<!${OPEN}(?:"[^"]*"|'[^']*')[\s;]*)-(?=\.?\d|[a-z])|_(?=-)|[^\w\s'".;-]`,
  'g'
);

/**
 * Write feet and inch marks as ASCII, so "5’11”", "5′11″" and "5´11´´" read like 5'11". Primes
 * and acute accents are always marks. A curly quote is a mark only right after a number or a
 * fraction, and not when it closes a quoted number, as in "“180” cm" and "the ‘5’ kg bag".
 * Full-width characters and the units "㎝" and "㎏" become their ASCII forms. Other characters
 * stay, so normalizeFractions still sees "½". The minus signs "−" and "﹣" become a hyphen-minus
 * "-" right before a number when no number comes earlier, so "−5 ft" is negative.
 */
export function normalizeForms(input: string): string {
  return input
    .replace(/[！-～㎝㎏]/g, character => character.normalize('NFKC'))
    .replace(MINUS_SIGN, '-')
    .replace(/[′´]/g, "'")
    .replace(/″/g, '"')
    .replace(CURLY_SINGLE, "'")
    .replace(CURLY_DOUBLE, '"');
}

/** Normalize comma groups before interpreting numeric syntax or splitting tokens. */
export function normalizeNumericCommas(input: string): string {
  let valid = true;
  const normalized = input.replace(
    /([\p{L}\p{M}_][\p{N}.]*,)|[.,]?\d(?:[\d.,]*\d)?/gu,
    (number, label?: string) => {
      // Commas outside the supported numeric group sizes remain punctuation.
      if (label || !/,\d{1,3}(?!\d)/.test(number)) return number;
      if (!/^(?:\d{1,3}(?:,\d{3})+|\d*)(?:,\d{1,2}|\.\d*)?$/.test(number)) {
        valid = false;
        return '';
      }
      return number.replace(/,(?=\d{1,2}$)/, '.').replace(/,/g, '');
    }
  );
  // Reject the whole input so a malformed component or range cannot leak a value.
  return valid ? normalized : '';
}

/**
 * Normalize the text in the order that the parser needs: the forms of marks and characters, then
 * comma numbers, then fractions. So "1,000 1/2" is 1000.5.
 */
export function normalize(input: string): string {
  return normalizeFractions(normalizeNumericCommas(normalizeForms(input)));
}

/**
 * Normalize text and split it into tokens. The parser does the same, but it also replaces each
 * range with a boundary first, so the tokens of `tokenize('5-11')` are "5" and "11".
 */
export function tokenize(input: string, fuzziness?: number): Token[] {
  return tokenizeNormalized(normalize(input), fuzziness);
}

/** Split normalized text while retaining negative signs and compound boundaries. */
export function tokenizeNormalized(input: string, fuzziness?: number): Token[] {
  const words = (
    input
      // Two apostrophes right after a number are an inch mark, as in "72''" (AFA-106).
      // normalizeForms writes "´´" and "’’" as two apostrophes too. They don't close a number
      // that two apostrophes open, as in "the ''5'' kg bag", and a third mark keeps them as
      // they are, as in "72'''", so each form gives what main gives. The lookahead runs first, so
      // the lookbehind doesn't scan back from every digit of a long number.
      .replace(/(?<=\d)(?='')(?<!(?:^|[^\w'"’])['’]{2}[^'’\s]*)''(?!['’])/g, '"')
      // A capital G right after a number, as in "5G phone", is a network generation, not
      // grams, which are written "g". Rename it before case is lost.
      .replace(/(?<=\d)G(?![A-Za-z])/g, 'gen')
      // Convert to lowercase for case-insensitive matching
      .toLowerCase()
      // Mark labels before the punctuation that marks them is removed, so the parser knows what
      // kind of label each one is, and spell out the short aliases. A bracket label keeps its
      // opening bracket, and a label after a field separator gets a field word first.
      .replace(
        LABEL_PATTERN,
        (_, field = '', open = '', alias?: string, assign?: string, name?: string) => {
          const word = alias ?? name ?? 'in';
          const short = LABEL_ALIASES.get(word);
          return `${field && `${field}${FIELD_WORD} `}${open}${short && (assign || name) ? NAME_WORD : UNIT_WORD} ${short ?? word}`;
        }
      )
      // "#" right after a number means pounds, as in "185#". Before a number, or before a letter,
      // a digit or another "#", as in "#5", "185#kg" and "12#3", it isn't a unit.
      .replace(/(?<=\d)#(?![\p{L}\p{N}_#])/gu, ' lb ')
      // Split punctuation, hyphens that join two values after a feet or inch mark, as in `5'-11`,
      // `5"-5 in`, `5'-eleven` and `five'-10"`, and underscores before minus signs.
      .replace(PUNCTUATION, ' ')
      // After a number, a unit and a hyphen join two parts or values, as in "5 ft-11",
      // "1 m-80 cm" and "150 lbs-180 lbs". A unit prefix without a number before it keeps the
      // minus sign, as in "kg-70.5". Check the prefix first so the lookbehind only runs when
      // needed. The lookbehind skips spaces and semicolons before the unit, as in "1;m-80 cm" and
      // "1 ; m-80 cm". It then captures the token before them only when that token has only
      // letters, digits and periods. That token must start after a space, a semicolon or the
      // start of the input, as in "kg;5 ft-11". Any other character matches the "\S" and captures
      // nothing. So the lookbehind reads back only over spaces, semicolons and those characters,
      // and a long token with many words before hyphens takes linear time.
      .replace(
        /(?<![\w-])(?=[a-z]+-)(?<=(?:(?<![^\s;])([a-z\d.]*)|\S)[\s;]*)([a-z]+)-(?=\.?\d)/g,
        (match, previous: string | undefined, word: string) => {
          const unit = matchUnit(word, 'height', fuzziness) || matchUnit(word, 'weight', fuzziness);
          // A token with other characters captures nothing, so it isn't a number either.
          return unit &&
            // Stryker disable next-line StringLiteral: any text that isn't a number gives null, as "" does.
            wordsToNumber(previous ?? '') === null
            ? `${word} -`
            : match;
        }
      )
      .replace(SPLIT, ' ')
      // Keep semicolons as separate tokens without adding surrounding whitespace.
      .match(/;|[^\s;]+/g) || []
  ).map(word => trimTrailing(word, '.'));
  // Move the kind of each label, and whether it starts a field, into the label's token. The field
  // word comes before the kind word, and the kind word comes right before the label.
  const tokens: Token[] = [];
  let startsField = false;
  let label: Token['label'];
  for (const text of words) {
    if (text === FIELD_WORD) startsField = true;
    else if (text === NAME_WORD) label = 'name';
    else if (text === UNIT_WORD) label = 'unit';
    else {
      tokens.push(label ? { text, label, startsField } : { text });
      startsField = false;
      label = undefined;
    }
  }
  return tokens;
}
