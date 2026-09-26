// Values advance by one through nineteen, then by ten from twenty through ninety.
const NUMBER_WORDS = new Map(
  'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety'
    .split(' ')
    .map((word, index): [string, number] => [word, index < 20 ? index : (index - 18) * 10])
);

const MULTIPLIERS = new Map<string, number>([
  ['hundred', 100],
  ['thousand', 1000],
]);

/** Parse a complete number phrase, including zero, hundreds, and thousands. */
export function wordsToNumber(input: string): number | null {
  const words = input
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word !== 'and');

  let hasHundred = false;
  let hasThousand = false;
  let total = 0;
  let current = 0;
  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    const number =
      NUMBER_WORDS.get(word) ?? (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(word) ? Number(word) : undefined);
    const multiplier = MULTIPLIERS.get(word);

    if (number !== undefined) {
      if (index > 0) {
        const previous = words[index - 1];
        const previousMultiplier = MULTIPLIERS.get(previous);
        const previousNumber = NUMBER_WORDS.get(previous) ?? 0;
        // Only a tens word and a ones value form an additive pair within a group.
        const followsTens =
          previousNumber >= 10 && previousNumber % 10 === 0 && number > 0 && number < 10;
        if (previousMultiplier !== undefined ? number >= previousMultiplier : !followsTens) {
          return null;
        }
      }
      current += number;
    } else if (multiplier !== undefined) {
      // Each group can contain one hundred, and the whole phrase one thousand.
      if (word === 'hundred') {
        if (hasHundred) return null;
        hasHundred = true;
      } else {
        if (hasThousand) return null;
        hasThousand = true;
        hasHundred = false;
      }
      current = current === 0 ? multiplier : current * multiplier;

      if (word === 'thousand') {
        total += current;
        current = 0;
      }
    } else {
      return null;
    }
  }
  return total + current;
}
