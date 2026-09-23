export function isTypeAssertionError(
  path: string,
  text: string,
  error: { line: number; column: number; code: string }
): boolean;
