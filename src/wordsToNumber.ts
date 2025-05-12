export function wordsToNumber(input: string): number | null {
  const words = input.toLowerCase().split(/\s+/);
  const SMALL: Record<string, number> = {
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
  };
  const TENS: Record<string, number> = {
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
  let total = 0,
    current = 0;
  for (let word of words) {
    if (SMALL[word] != null) current += SMALL[word];
    else if (TENS[word] != null) current += TENS[word];
    else if (word === 'and') continue;
    else if (MULTIPLIERS[word]) {
      current *= MULTIPLIERS[word];
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
