export function tokenize(input: string): string[] {
  // First, identify and isolate feet and inches symbols
  const withSpaces = input
    .toLowerCase()
    // Add spaces around foot and inch marks when they're attached to numbers
    .replace(/([0-9])(['"])/g, '$1 $2')
    // Clean up other non-word characters except quotes
    .replace(/[^\w\s'"]/g, '');

  // Split on whitespace
  return withSpaces.split(/\s+/);
}
