import { matchUnit } from './matchUnit';
import { wordsToNumber } from './wordsToNumber';

/** Split measurement text while retaining negative signs and compound boundaries. */
export function tokenize(input: string, fuzziness?: number): string[] {
  return (
    input
      // Convert to lowercase for case-insensitive matching
      .toLowerCase()
      // Keep semicolons visible to compound-height parsing while separating adjacent tokens.
      .replace(/;/g, ' ; ')
      // Normalize numeric commas (1,000 -> 1000, 72,5 -> 72.5) and separate other punctuation.
      // Split a hyphen after quoted feet and label underscores before minus signs too.
      .replace(
        /(?<=\d),(\d{3}|(\d{1,2}))(?!\d)|(?<=\d\s*')-(?=\.?\d)|_(?=-)|[^\w\s'".;-]/g,
        (_, digits?: string, decimal?: string) => (decimal ? `.${decimal}` : digits || ' ')
      )
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
