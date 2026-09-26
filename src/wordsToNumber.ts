const NUMBER_WORDS = new Map<string, number>([
  ['zero', 0],
  ['one', 1],
  ['two', 2],
  ['three', 3],
  ['four', 4],
  ['five', 5],
  ['six', 6],
  ['seven', 7],
  ['eight', 8],
  ['nine', 9],
  ['ten', 10],
  ['eleven', 11],
  ['twelve', 12],
  ['thirteen', 13],
  ['fourteen', 14],
  ['fifteen', 15],
  ['sixteen', 16],
  ['seventeen', 17],
  ['eighteen', 18],
  ['nineteen', 19],
  ['twenty', 20],
  ['thirty', 30],
  ['forty', 40],
  ['fifty', 50],
  ['sixty', 60],
  ['seventy', 70],
  ['eighty', 80],
  ['ninety', 90],
]);

const MULTIPLIERS = new Map<string, number>([
  ['hundred', 100],
  ['thousand', 1000],
]);

export function wordsToNumber(input: string): number | null {
  const words = input
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word !== 'and');

  try {
    const result = words.reduce(
      (acc, word, index) => {
        let { total, current } = acc;

        const number =
          NUMBER_WORDS.get(word) ??
          (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(word) ? Number(word) : undefined);
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
              throw new Error('Independent number values');
            }
          }
          current += number;
        } else if (multiplier !== undefined) {
          current = current === 0 ? multiplier : current * multiplier;

          if (word === 'thousand') {
            total += current;
            current = 0;
          }
        } else {
          throw new Error(`Invalid number word: ${word}`);
        }

        return { total, current };
      },
      { total: 0, current: 0 }
    );

    return result.total + result.current;
  } catch {
    return null;
  }
}
