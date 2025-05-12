export function tokenize(input: string): string[] {
  return (
    input
      // Convert to lowercase for case-insensitive matching
      .toLowerCase()
      // Find negative numbers like "-5" or "-5.5" and ensure they have spaces around them
      // Input: "height-5feet" -> "height -5 feet"
      .replace(/-(\d+(\.\d+)?)/g, ' -$1 ')
      // Add spaces between numbers and any following letters/units or quotes
      // Example: "5ft" -> "5 ft", "72.5kg" -> "72.5 kg"
      .replace(/([0-9])([a-z]+\.?|['"])/g, '$1 $2')
      // Add spaces between quotes and any following numbers
      // Example: "'" -> "' 5", "\"11" -> "\" 11"
      .replace(/(['"])([0-9])/g, '$1 $2')
      // Replace standalone hyphens (not part of negative numbers) with spaces
      // Example: "six-foot-two" -> "six foot two"
      .replace(/(?<!-)\b-\b/g, ' ')
      // Replace any remaining special characters with spaces
      // Preserves: alphanumeric, whitespace, quotes ('), double quotes ("), period (.), hyphen (-)
      .replace(/[^\w\s'".-]/g, ' ')
      // Split into tokens by any whitespace (space, tab, newline)
      .split(/\s+/)
      // Remove empty tokens
      .filter(Boolean)
      .map(token => {
        // Preserve numbers (including negative & decimals) and single/double quotes as is
        // Examples: "-5", "5.5", "'", "\""
        if (/^-?\d+(\.\d+)?$|^['"]$/.test(token)) return token;
        // For all other tokens, remove any trailing periods
        // Example: "lbs." -> "lbs"
        return token.replace(/\.+$/, '');
      })
  );
}
