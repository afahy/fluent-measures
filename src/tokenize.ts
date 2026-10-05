import { matchUnit } from './matchUnit';
import { FIELD_MARK, LABEL_ALIASES, NAME_MARK, UNIT_ALIASES, UNIT_MARK } from './units';
import { wordsToNumber } from './wordsToNumber';

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

/** Normalize comma numbers before splitting standalone measurement text. */
export function tokenize(input: string, fuzziness?: number): string[] {
  return tokenizeNormalized(normalizeNumericCommas(input), fuzziness);
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
        // Split punctuation, hyphens after quoted feet, and underscores before minus signs.
        .replace(/(?<=\d\s*')-(?=\.?\d)|_(?=-)|[^\w\s'".;-]/g, ' ')
        // Populated feet introduce inches; standalone unit prefixes retain the minus sign.
        // Check the prefix first so the lookbehind only scans the preceding token when needed.
        .replace(
          /(?<![\w-])(?=[a-z]+-)(?<=(\S*)\s*)([a-z]+)-(?=\.?\d)/g,
          (match, previous: string, word: string) => {
            const unit =
              matchUnit(word, 'height', fuzziness) || matchUnit(word, 'weight', fuzziness);
            return unit && (unit !== 'ft' || previous === 'and' || wordsToNumber(previous) === null)
              ? `${word} -`
              : match;
          }
        )
        // Separate numbers from attached units or quotes, retaining signs after opening quotes.
        // Word hyphens also separate tokens: "six-foot-two" -> "six foot two".
        .replace(/(?<=\d)(?=[a-z'"])|(?<=['"])(?=-?\.?\d)|(?<!-)\b-(?=\b|\.\d)/g, ' ')
        // Keep semicolons as separate tokens without adding surrounding whitespace.
        .match(/;|[^\s;]+/g) || []
    ).map(token => token.replace(/\.+$/, ''))
  );
}
