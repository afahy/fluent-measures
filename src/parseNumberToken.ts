import { wordsToNumber } from './wordsToNumber';

export function parseNumberToken(token: string): number | null {
  const isNegative = token.startsWith('-');
  const absToken = isNegative ? token.slice(1) : token;

  const num = parseFloat(absToken);
  if (!isNaN(num)) {
    const finalNum = isNegative ? -num : num;
    return finalNum <= 0 ? null : finalNum;
  }
  const wordNum = wordsToNumber(absToken);
  if (wordNum !== null) {
    const finalNum = isNegative ? -wordNum : wordNum;
    return finalNum <= 0 ? null : finalNum;
  }
  return null;
}
