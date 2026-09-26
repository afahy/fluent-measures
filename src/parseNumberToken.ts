import { wordsToNumber } from './wordsToNumber';

/** Parse a positive numeric token or written number, rejecting signed values. */
export function parseNumberToken(token: string): number | null {
  // Negative values and repeated minus signs are never valid measurements.
  if (token.startsWith('-')) return null;

  const num = parseFloat(token);
  const value = isNaN(num) ? wordsToNumber(token) : num;
  return value !== null && value > 0 ? value : null;
}
