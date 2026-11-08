import { MULTIPLIERS, NUMBER_WORDS } from './wordsToNumber';

/** A token retains every non-whitespace character and its normalized-text boundaries. */
interface Token {
  text: string;
  start: number;
  end: number;
}

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

/** Writes a fraction as a decimal, or as "x" when it isn't a proper fraction of whole numbers. */
function writeFraction(text: string, whole = '', numerator: string, denominator: string): string {
  const value = String(+whole + +numerator / +denominator);
  return +numerator < +denominator && !text.includes('.') && !value.includes('e') ? value : 'x';
}

// The Unicode fractions ¼ to ¾, ⅐ to ⅞ and ↉, as the inside of a character class.
const FRACTIONS = '¼-¾⅐-⅞↉';
// AFA-62: keep complete identifier boundaries and split before comma/fraction normalization.
const COMPACT_HEIGHT = new RegExp(
  String.raw`(?<=(?<![\p{L}\p{M}\p{N}_.])\d*(?:\.\d+)?[${FRACTIONS}]?(?:ft|foot|feet|m|meters?|metres?)\.?)(?=[\d${FRACTIONS}])`,
  'giu'
);
const UNICODE_FRACTION = new RegExp(
  String.raw`(?<![\d/.])(?:${FRACTION_NUMBER}\s*)?([${FRACTIONS}])(\d+)?`,
  'gu'
);

/** Normalize individual fractions; invalid fragments remain non-numeric tokens. */
function normalizeFractionParts(input: string): string {
  return input
    .replace(
      UNICODE_FRACTION,
      (text: string, whole: string | undefined, fraction: string, trailing: string | undefined) => {
        const [numerator, denominator] = fraction.normalize('NFKD').split('⁄');
        // Keep an invalid fragment as one non-number, including any following decimal tail.
        // Its period prevents it from owning a later slash fraction, then trims off in M2.
        return trailing || whole?.includes('.')
          ? 'x.'
          : writeFraction(text, whole, numerator, denominator);
      }
    )
    .replace(SLASH_FRACTION, writeFraction);
}

/** Normalize proper fractions without discarding any surrounding boundary or fragment. */
export function normalizeFractions(input: string): string {
  return normalizeFractionParts(input);
}

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

// A number word, alone or before "and a half", has the same boundaries as in the token split.
const WORD_END = String.raw`(?:\b(?:${NUMBER_WORD})|(?:\d|\b(?:${NUMBER_WORD}))[\s-]+and[\s-]+a[\s-]+half)`;

/**
 * A curly closing quote after a number is a feet or inch mark, as in "5’11”" and "five’ ten”".
 * The number can be digits, a Unicode fraction or a number word, with spaces after it. One feet
 * mark can come between, as in "5’’". Quotation marks don't wrap an entry or a number, so there
 * is no quotation to keep. An apostrophe in a word, as in "she’s" and "I’m", stays. The
 * lookahead keeps the lookbehind from running at every character.
 */
const curlyMark = (mark: string): RegExp =>
  new RegExp(
    String.raw`(?=${mark})(?:(?<=[\d${FRACTIONS}]['’′]?\s*)|(?<=${WORD_END}\s*)(?!${mark}[a-z]))${mark}`,
    'gi'
  );
const CURLY_SINGLE = curlyMark('’');
const CURLY_DOUBLE = curlyMark('”');

/**
 * Normalize feet and inch marks, so "5’11”", "5′11″" and "5´11´´" read like 5'11". Primes and
 * acute accents keep their unit identity as ′ and ″. Full-width characters and the units "㎝" and
 * "㎏" become their ASCII forms. Other characters stay, so normalizeFractions still sees "½". The
 * minus signs "−" and "﹣" become a hyphen-minus "-" right before a number when no number comes
 * earlier, so "−5 ft" is negative.
 */
export function normalizeForms(input: string): string {
  return input
    .replace(/[！-～㎝㎏]/g, character => character.normalize('NFKC'))
    .replace(MINUS_SIGN, '-')
    .replace(/[′´ʹ]/g, '′')
    .replace(/[″ʺ]/g, '″')
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
        // Stryker disable next-line StringLiteral: valid is false, so the function returns '' and never uses this value (AFA-165).
        return '';
      }
      return number.replace(/,(?=\d{1,2}$)/, '.').replace(/,/g, '');
    }
  );
  // Reject the whole input so a malformed component or range cannot leak a value. Another string
  // here changes a result only for contradicting options, which AFA-178 asks about.
  return valid ? normalized : '';
}

/**
 * Normalize the text in the order that the parser needs: the forms of marks and characters, then
 * comma numbers, then fractions. So "1,000 1/2" is 1000.5.
 */
export function normalize(input: string): string {
  return normalizeFractions(
    normalizeNumericCommas(normalizeForms(input).replace(COMPACT_HEIGHT, ' '))
  );
}

/** Normalize and emit the same tokens used by the complete-entry reader. */
export function tokenize(input: string): Token[] {
  return tokenizeNormalized(normalize(input));
}

/**
 * Preserve punctuation and unknown text. Interpretation belongs to the ordered expression
 * reader, so no field markers, range erasure, or used-token ownership is needed here.
 * The existing normalization passes remain shared; this is not the AFA-88 rewrite.
 */
export function tokenizeNormalized(input: string): Token[] {
  const text = input
    // Two feet marks right after a number are an inch mark, as in "5''" and "5′'".
    .replace(/(?<=\d)['′]{2}(?!['’′])/g, '″')
    .toLowerCase();
  return [...text.matchAll(/i['’]m\b|[\p{L}\p{M}_][\p{L}\p{M}\p{N}_]*\.?|[\d.]+|[^\s]/gu)].flatMap(
    match => {
      const token = { text: match[0], start: match.index, end: match.index + match[0].length };
      const word = token.text.slice(0, -1);
      // A number word or complete decimal can precede a final period. Retain that period
      // as punctuation; only the cursor can accept it or reject it inside an expression.
      // Keep the established integer-with-decimal-point spelling ("72. kg") unchanged.
      if (
        token.text.endsWith('.') &&
        (NUMBER_WORDS.has(word) ||
          MULTIPLIERS.has(word) ||
          word === 'half' ||
          /^\d*\.\d+$/.test(word))
      ) {
        return [
          { text: word, start: token.start, end: token.end - 1 },
          { text: '.', start: token.end - 1, end: token.end },
        ];
      }
      return [token];
    }
  );
}
