import { matchUnit } from './matchUnit';
import { LABEL_ALIASES, LABEL_MARK } from './units';
import { wordsToNumber } from './wordsToNumber';

// A short alias in brackets or before a colon or equals sign, as in "(in)", "m:" and "in = 72",
// is a label. So is "in." followed by a space, the usual abbreviation for inches. The alias must
// be a word of its own, so "check-in: 5" isn't a label, with any kind of hyphen or dash, and
// neither is "µm: 5" after any Unicode letter. The opening bracket is matched forward: some
// engines run a lookbehind such as `(?<=\(\s*)` in quadratic time across a long run of spaces.
const LABELS = [...LABEL_ALIASES.keys()].join('|');
const WORD_BEFORE = '(?<![\\p{L}\\p{M}\\p{N}_\\p{Dash}])';
const LABEL_PATTERN = new RegExp(
  `([([]\\s*)(${LABELS})(?=\\.?\\s*[)\\]])|${WORD_BEFORE}(?:${LABELS})(?=\\.?\\s*[:=])|${WORD_BEFORE}in(?=\\.(?:\\s|$))`,
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
        // Spell out label aliases before the punctuation that marks them is removed, after a mark
        // that tells the parser it's a label. A bracket label keeps its opening bracket.
        .replace(
          LABEL_PATTERN,
          (label, open = '', alias = label) =>
            `${open}${LABEL_MARK} ${LABEL_ALIASES.get(alias) ?? alias}`
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
