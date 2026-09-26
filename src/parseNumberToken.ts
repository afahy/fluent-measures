import { wordsToNumber } from './wordsToNumber';

export function parseNumberToken(token: string): number | null {
  // Negative values and repeated minus signs are never valid measurements.
  if (token.startsWith('-')) return null;

  const num = parseFloat(token);
  if (!isNaN(num)) {
    return num <= 0 ? null : num;
  }
  const wordNum = wordsToNumber(token);
  if (wordNum !== null) {
    return wordNum <= 0 ? null : wordNum;
  }
  return null;
}
