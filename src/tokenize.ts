import { matchUnit } from './matchUnit';

export function tokenize(input: string, fuzziness?: number): string[] {
  return (
    input
      // Convert to lowercase for case-insensitive matching
      .toLowerCase()
      // A quote after a numeric feet component can introduce a height separator.
      .replace(/(\d\s*)'-(?=\.?\d)/g, "$1' ")
      // Separate label underscores from a minus sign before splitting word hyphens.
      .replace(/_-/g, ' -')
      // A standalone unit prefix retains its following minus sign.
      .replace(/(?<![\w-])([a-z]+)-(?=\.?\d)/g, (match, word: string) =>
        matchUnit(word, 'height', fuzziness) || matchUnit(word, 'weight', fuzziness)
          ? `${word} -`
          : match
      )
      // Add spaces between numbers and any following letters/units or quotes
      // Example: "5ft" -> "5 ft", "72.5kg" -> "72.5 kg"
      .replace(/([0-9])([a-z]+\.?|['"])/g, '$1 $2')
      // Separate quoted numbers while preserving a minus after an opening quote.
      .replace(/(['"])(?=-?\.?\d)/g, '$1 ')
      // Replace standalone hyphens (not part of negative numbers) with spaces
      // Example: "six-foot-two" -> "six foot two"
      .replace(/(?<!-)\b-(?=\b|\.\d)/g, ' ')
      // Replace any remaining special characters with spaces
      // Preserves: alphanumeric, whitespace, quotes ('), double quotes ("), period (.), hyphen (-)
      .replace(/[^\w\s'".-]/g, ' ')
      // Split into tokens by any whitespace (space, tab, newline)
      .split(/\s+/)
      // Remove empty tokens
      .filter(Boolean)
      // Remove trailing periods (for example, "lbs." -> "lbs").
      .map(token => token.replace(/\.+$/, ''))
  );
}
