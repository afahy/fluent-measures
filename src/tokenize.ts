import { matchUnit } from './matchUnit';
import { wordsToNumber } from './wordsToNumber';

export function tokenize(input: string, fuzziness?: number): string[] {
  return (
    input
      // Convert to lowercase for case-insensitive matching
      .toLowerCase()
      // A quote after a numeric feet component can introduce a height separator.
      .replace(/(\d\s*)'-(?=\.?\d)/g, "$1' ")
      // Separate label underscores from a minus sign before splitting word hyphens.
      .replace(/_-/g, ' -')
      // Separate labels and punctuation before interpreting adjacent unit prefixes.
      .replace(/[^\w\s'".-]/g, ' ')
      // Populated feet introduce inches; standalone unit prefixes retain the minus sign.
      // Check the prefix first so the lookbehind only scans the preceding token when needed.
      .replace(
        /(?<![\w-])(?=[a-z]+-)(?<=(\S*)\s*)([a-z]+)-(?=\.?\d)/g,
        (match, previous: string, word: string) => {
          const unit = matchUnit(word, 'height', fuzziness) || matchUnit(word, 'weight', fuzziness);
          return unit && !(unit === 'ft' && previous !== 'and' && wordsToNumber(previous) !== null)
            ? `${word} -`
            : match;
        }
      )
      // Add spaces between numbers and any following letters/units or quotes
      // Example: "5ft" -> "5 ft", "72.5kg" -> "72.5 kg"
      .replace(/([0-9])([a-z]+\.?|['"])/g, '$1 $2')
      // Separate quoted numbers while preserving a minus after an opening quote.
      .replace(/(['"])(?=-?\.?\d)/g, '$1 ')
      // Replace standalone hyphens (not part of negative numbers) with spaces
      // Example: "six-foot-two" -> "six foot two"
      .replace(/(?<!-)\b-(?=\b|\.\d)/g, ' ')
      // Split into tokens by any whitespace (space, tab, newline)
      .split(/\s+/)
      // Remove empty tokens
      .filter(Boolean)
      // Remove trailing periods (for example, "lbs." -> "lbs").
      .map(token => token.replace(/\.+$/, ''))
  );
}
