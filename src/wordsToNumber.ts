// Values advance by one through nineteen, then by ten from twenty through ninety. The condition is
// <= 19, not < 20: "twenty" is 20 by either formula, so "< 20" had a mutant that no test can kill
// (AFA-165).
export const NUMBER_WORDS = new Map(
  'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety'
    .split(' ')
    .map((word, index): [string, number] => [word, index <= 19 ? index : (index - 18) * 10])
);

export const MULTIPLIERS = new Map<string, number>([
  ['hundred', 100],
  ['thousand', 1000],
]);

/** Private shared result. invalidAt indexes the supplied tokens, including skipped "and". */
export interface NumberReading {
  value: number | null;
  invalidAt: number;
}

/** Read the complete supplied numeric tokens; failure never exposes a partial value. */
export function readNumberTokens(tokens: readonly string[]): NumberReading {
  // Preserve the string adapter's trailing-conjunction compatibility without mutating or
  // renumbering supplied tokens. The complete-entry grammar validates its own joins.
  let end = tokens.length;
  while (tokens[end - 1] === 'and') end--;
  const point = tokens.indexOf('point');
  const words = tokens
    .slice(0, point < 0 ? end : point)
    .map((word, index) => ({ word, index }))
    .filter(part => part.word !== 'and');

  let hasHundred = false;
  let hasThousand = false;
  let total = 0;
  let current = 0;
  for (let index = 0; index < words.length; index++) {
    const word = words[index].word;
    const number =
      NUMBER_WORDS.get(word) ?? (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(word) ? +word : undefined);
    const multiplier = MULTIPLIERS.get(word);

    if (number !== undefined) {
      if (index > 0) {
        const previous = words[index - 1].word;
        const previousMultiplier = MULTIPLIERS.get(previous);
        const previousNumber = NUMBER_WORDS.get(previous) ?? 0;
        // Only a tens word and a ones value form an additive pair within a group.
        const followsTens =
          previousNumber >= 10 && previousNumber % 10 === 0 && number > 0 && number < 10;
        // A ones word and then a tens word, as the first two words, are spoken hundreds, as in
        // "one eighty" for 180. Every number word from twenty up is a tens word.
        if (index === 1 && previousNumber && previousNumber < 10 && NUMBER_WORDS.get(word)! >= 20) {
          current *= 100;
          hasHundred = true;
        } else if (previousMultiplier !== undefined ? number >= previousMultiplier : !followsTens) {
          return { value: null, invalidAt: words[index].index };
        }
      }
      current += number;
    } else if (multiplier !== undefined) {
      // Each group can contain one hundred, and the whole phrase one thousand.
      if (word === 'hundred') {
        if (hasHundred) return { value: null, invalidAt: words[index].index };
        hasHundred = true;
      } else {
        if (hasThousand) return { value: null, invalidAt: words[index].index };
        hasThousand = true;
        hasHundred = false;
      }
      current = current === 0 ? multiplier : current * multiplier;

      if (word === 'thousand') {
        total += current;
        current = 0;
      }
    } else {
      return { value: null, invalidAt: words[index].index };
    }
  }
  // A phrase with no whole part is valid only when it starts at "point".
  const whole = words.length ? total + current : point === 0 ? 0 : null;
  if (point < 0) return { value: whole, invalidAt: tokens.length };
  if (!Number.isInteger(whole)) return { value: null, invalidAt: point };
  let digits = '';
  for (let index = point + 1; index < end; index++) {
    const word = tokens[index];
    const number = NUMBER_WORDS.get(word) ?? 10;
    const digit = number < 10 ? String(number) : word;
    // Empty chunks retain wordsToNumber's trailing-space behavior; at least one digit is
    // still required. Conjunctions inside the fraction, signs and another point are invalid.
    if (!/^\d*$/.test(digit)) return { value: null, invalidAt: index };
    digits += digit;
  }
  return digits
    ? { value: whole! + Number(`0.${digits}`), invalidAt: tokens.length }
    : { value: null, invalidAt: end };
}

/** Compatible adapter for complete number strings; invalid phrases still return null. */
export function wordsToNumber(input: string): number | null {
  return readNumberTokens(input.toLowerCase().split(/\s+/)).value;
}
