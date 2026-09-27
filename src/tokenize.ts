import { matchUnit } from './matchUnit';
import { wordsToNumber } from './wordsToNumber';

/** Normalize comma groups before interpreting numeric syntax or splitting tokens. */
export function normalizeNumericCommas(input: string): string {
  // Commas after labels are separators; fractions may omit the leading zero.
  return input
    .replace(/,(?<![\p{L}\p{M}_][\p{N}.]*,)(?=\d{1,2}(?!\d))/gu, '.')
    .replace(/(?<=\d),(?<![\p{L}\p{M}_][\p{N}.]*,)(?=\d{3}(?!\d))/gu, '');
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
        // Convert to lowercase for case-insensitive matching
        .toLowerCase()
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
