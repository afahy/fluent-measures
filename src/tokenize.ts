import { matchUnit } from './matchUnit';
import { FIELD_MARK, LABEL_ALIASES, NAME_MARK, UNIT_ALIASES, UNIT_MARK } from './units';
import { MULTIPLIERS, NUMBER_WORDS, wordsToNumber } from './wordsToNumber';

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

/**
 * Write each proper fraction as a decimal, so "150 1/2" and "150½" are 150.5. A whole number
 * before the fraction is part of it. Other numbers with a slash between them become "x", with
 * their whole number, so "5/2" and "150 5/2" can't be read as a value. So does a fraction with a
 * decimal in it, or one whose result needs an exponent. A date such as "12/25/2020" has two
 * slashes and stays as it is. Run this after normalizeNumericCommas, so "1,000 1/2" is 1000.5.
 */
export function normalizeFractions(input: string): string {
  return input
    .replace(
      /(?<![\d/.])(?:(\d+)\s*)?([¼-¾⅐-⅞↉])/gu,
      (text: string, whole: string | undefined, fraction: string) => {
        const [numerator, denominator] = fraction.normalize('NFKD').split('⁄');
        return writeFraction(text, whole, numerator, denominator);
      }
    )
    .replace(SLASH_FRACTION, writeFraction);
}

// A number as it can stand in quotes: digits, separators, spaces, slashes and fractions.
const QUOTED_NUMBER = String.raw`[\d.,\s/⁄¼-¾⅐-⅞↉]*[\d¼-¾⅐-⅞↉]`;
// A single or double curly mark right after a number. It closes a quoted number only when its
// opening quote comes right before that number and no digit follows, as in "“5 1/2” ft".
const CURLY_SINGLE = new RegExp(
  String.raw`(?<=[\d¼-¾⅐-⅞↉]['’]?)(?:(?<!‘${QUOTED_NUMBER})’|’(?=\d))`,
  'g'
);
const CURLY_DOUBLE = new RegExp(
  String.raw`(?<=[\d¼-¾⅐-⅞↉])(?:(?<!“${QUOTED_NUMBER})”|”(?=\d))`,
  'g'
);

// A minus sign before a number, when no number comes earlier: no digit, Unicode fraction or number
// word. After a number, a minus sign joins two parts or values, as in "1 m−80 cm" and "½ lb−180
// lbs". The parser would read a hyphen-minus there as a sign. The lookbehind runs only after a
// minus sign, and its lazy part stops at the nearest earlier number.
const MINUS_SIGN = new RegExp(
  String.raw`[−﹣](?=[.,]?\d|[¼-¾⅐-⅞↉])(?<!(?:[\d¼-¾⅐-⅞↉]|\b(?:${[...NUMBER_WORDS.keys(), ...MULTIPLIERS.keys()].join('|')})\b)[\s\S]*?.)`,
  'gi'
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

/** Normalize fractions and comma numbers before splitting standalone measurement text. */
export function tokenize(input: string, fuzziness?: number): string[] {
  return tokenizeNormalized(
    normalizeFractions(normalizeNumericCommas(normalizeForms(input))),
    fuzziness
  );
}

/** Split normalized text while retaining negative signs and compound boundaries. */
export function tokenizeNormalized(input: string, fuzziness?: number): string[] {
  return (
    (
      input
        // A capital G right after a number, as in "5G phone", is a network generation, not
        // grams, which are written "g". Rename it before case is lost.
        .replace(/(?<=\d)G(?![A-Za-z])/g, 'gen')
        // Convert to lowercase for case-insensitive matching
        .toLowerCase()
        // Mark labels before the punctuation that marks them is removed, so the parser knows what
        // kind of label each one is, and spell out the short aliases. A short alias before ":" or
        // "=" is a field name, in brackets too, as in "age 28 (in): 180 lbs". Other units are
        // always unit labels, so "180 lbs = 82 kg" keeps 180 lb. A bracket label keeps its opening
        // bracket, and a label after a field separator gets a field mark first.
        .replace(
          LABEL_PATTERN,
          (_, field = '', open = '', alias?: string, assign?: string, name?: string) => {
            const word = alias ?? name ?? 'in';
            const short = LABEL_ALIASES.get(word);
            return `${field && `${field}${FIELD_MARK} `}${open}${short && (assign || name) ? NAME_MARK : UNIT_MARK} ${short ?? word}`;
          }
        )
        // "#" right after a number means pounds, as in "185#". Before a number, or before a letter,
        // a digit or another "#", as in "#5", "185#kg" and "12#3", it isn't a unit.
        .replace(/(?<=\d)#(?![\p{L}\p{N}_#])/gu, ' lb ')
        // Split punctuation, hyphens after a feet or inch mark, as in "5'-11" and "5"-5 in", and
        // underscores before minus signs.
        .replace(/(?<=\d\s*['"])-(?=\.?\d)|_(?=-)|[^\w\s'".;-]/g, ' ')
        // After a number, a unit and a hyphen join two parts or values, as in "5 ft-11",
        // "1 m-80 cm" and "150 lbs-180 lbs". A unit prefix without a number before it keeps the
        // minus sign, as in "kg-70.5". Check the prefix first so the lookbehind only runs when
        // needed. The lookbehind captures the token before the unit only when it has only letters,
        // digits and periods. Semicolons at its end don't count, as in "1;m-80 cm". Any other
        // token matches the "\S" and captures nothing. So the lookbehind reads back only over
        // those characters, and a long token with many words before hyphens takes linear time.
        .replace(
          /(?<![\w-])(?=[a-z]+-)(?<=(?:(?<!\S)([a-z\d.]*);*|\S)\s*)([a-z]+)-(?=\.?\d)/g,
          (match, previous: string | undefined, word: string) => {
            const unit =
              matchUnit(word, 'height', fuzziness) || matchUnit(word, 'weight', fuzziness);
            // A token with other characters captures nothing, so it isn't a number either.
            return unit &&
              // Stryker disable next-line StringLiteral: any text that isn't a number gives null, as "" does.
              wordsToNumber(previous ?? '') === null
              ? `${word} -`
              : match;
          }
        )
        // Separate numbers from attached units or quotes, retaining signs after opening quotes.
        // Word hyphens also separate tokens: "six-foot-two" -> "six foot two".
        .replace(/(?<=\d)(?=[a-z'"])|(?<=['"])(?=-?\.?\d)|(?<!-)\b-(?=\b|\.\d)/g, ' ')
        // Keep semicolons as separate tokens without adding surrounding whitespace.
        .match(/;|[^\s;]+/g) || []
    ).map(token => trimTrailing(token, '.'))
  );
}
