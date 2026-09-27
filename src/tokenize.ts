import { matchUnit } from './matchUnit';
import { wordsToNumber } from './wordsToNumber';

/** Normalize comma groups before interpreting numeric syntax or splitting tokens. */
export function normalizeNumericCommas(input: string): string {
  // Keep word-separating commas as punctuation; fractions may omit the leading zero.
  return input
    .replace(/(?<![a-z_]),(?=\d{1,2}(?!\d))/gi, '.')
    .replace(/(?<=\d),(?=\d{3}(?!\d))/g, '');
}

/** Normalize comma numbers before splitting standalone measurement text. */
export function tokenize(input: string, fuzziness?: number): string[] {
  return tokenizeNormalized(normalizeNumericCommas(input), fuzziness);
}

/** Split normalized text while retaining negative signs and compound boundaries. */
export function tokenizeNormalized(input: string, fuzziness?: number): string[] {
  return (
    input
      // Convert to lowercase for case-insensitive matching
      .toLowerCase()
      // Keep semicolons visible to compound-height parsing while separating adjacent tokens.
      .replace(/;/g, ' ; ')
      // Split punctuation, hyphens after quoted feet, and underscores before minus signs.
      .replace(/(?<=\d\s*')-(?=\.?\d)|_(?=-)|[^\w\s'".;-]/g, ' ')
      // Populated feet introduce inches; standalone unit prefixes retain the minus sign.
      // Check the prefix first so the lookbehind only scans the preceding token when needed.
      .replace(
        /(?<![\w-])(?=[a-z]+-)(?<=(\S*)\s*)([a-z]+)-(?=\.?\d)/g,
        (match, previous: string, word: string) => {
          const unit = matchUnit(word, 'height', fuzziness) || matchUnit(word, 'weight', fuzziness);
          return unit && (unit !== 'ft' || previous === 'and' || wordsToNumber(previous) === null)
            ? `${word} -`
            : match;
        }
      )
      // Separate numbers from attached units or quotes, retaining signs after opening quotes.
      // Word hyphens also separate tokens: "six-foot-two" -> "six foot two".
      .replace(/(?<=\d)(?=[a-z'"])|(?<=['"])(?=-?\.?\d)|(?<!-)\b-(?=\b|\.\d)/g, ' ')
      // Split into tokens by any whitespace (space, tab, newline)
      .split(/\s+/)
      // Remove empty tokens
      .filter(Boolean)
      // Remove trailing periods (for example, "lbs." -> "lbs").
      .map(token => token.replace(/\.+$/, ''))
  );
}
