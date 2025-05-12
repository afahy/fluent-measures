const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const MULTIPLIERS: Record<string, number> = {
  hundred: 100,
  thousand: 1000,
};

export function wordsToNumber(input: string): number | null {
  const words = input
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word !== 'and');

  try {
    const result = words.reduce(
      (acc, word) => {
        let { total, current } = acc;

        if (NUMBER_WORDS[word] != null) {
          current += NUMBER_WORDS[word];
        } else if (MULTIPLIERS[word]) {
          current = current === 0 ? MULTIPLIERS[word] : current * MULTIPLIERS[word];

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
