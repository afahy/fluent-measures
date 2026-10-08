import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions } from '../src';

// The result snapshot shows each result that a change to the parser changes (AFA-86). The inputs
// come from a fixed vocabulary and a seeded generator, so they stay the same from run to run. The
// expected values are the parser's results when the snapshot was written. A change that changes
// a result must update the snapshot and list the changed lines in its pull request.

type Groups = readonly (readonly [weight: number, words: readonly string[]])[];

// Numbers in each form that the normalizers and the tokenizer read.
const NUMBERS: Groups = [
  // Digits, decimals and comma groups.
  [10, ['0', '1', '2', '5', '6', '11', '12', '70', '72', '80', '150', '180', '1000']],
  [4, ['5.5', '1.8', '1.75', '72.5', '.5', '0.75', '180.0', '5.11']],
  [3, ['1,000', '72,5', '1,234.5', '12,345', '1,8']],
  // Fractions and the words that make a number.
  [3, ['1/2', '3/4', '5/2', '10/180', '½', '¼', '¾', '5½']],
  [
    5,
    [
      'five',
      'six',
      'eleven',
      'twelve',
      'seventy',
      'eighty',
      'one',
      'hundred',
      'zero',
      'one-eighty',
    ],
  ],
];

// Each unit alias, the unsupported weight units, some typos and the marks for feet and inches.
const UNITS: Groups = [
  [8, ['ft', 'feet', 'foot', 'in', 'inch', 'inches', 'cm', 'centimeter', 'centimeters']],
  [8, ['m', 'meter', 'meters', 'lb', 'lbs', 'pound', 'pounds']],
  [6, ['kg', 'kilo', 'kilos', 'kilogram', 'kilograms']],
  [3, ['st', 'stone', 'oz', 'ounces', 'g', 'grams']],
  [2, ['kilogams', 'fet', 'inchs', 'poundz', 'metres', 'centimetre', 'centimetres', '#']],
  [6, ["'", '"', "''", '’', '”', '‘', '“', '′', '″', '´']],
];

// Other words: number connectors, dashes, labels, separators and words that read as units in
// other places.
const OTHERS: Groups = [
  [3, ['and', 'a', 'half']],
  [3, ['-', '–', '−']],
  [3, ['(kg)', 'kg:', 'in=', 'in.', '(in)', 'm:', 'lbs:', 'height:', 'weight=']],
  [3, [',', ';', '&', '=', '5G']],
  [4, ['in', 'm', 'the', 'Top', 'tall', 'about', 'age', 'Oct', '1st']],
];

// Words go together with one of these: a space, nothing, a hyphen or a comma.
const JOINERS = [' ', ' ', '', '-', ','];

const OPTION_SETS: readonly (readonly [name: string, options: ParseOptions])[] = [
  ['-', {}],
  ['h', { type: 'height' }],
  ['w', { type: 'weight' }],
  ['cm', { normalizedUnit: 'cm' }],
  ['f2', { fuzziness: 2 }],
  ['hu', { type: 'height', allowUnqualified: true, inferUnit: 'metric' }],
];

const INPUT_COUNT = 1800;

// The alias "metre" has its own path in matchUnit. It isn't in UNITS, because a new word there
// would change the generated inputs that AFA-86 recorded, so these inputs use it (AFA-87).
const METRE_INPUTS = [
  'metre',
  '1.8 metre',
  '1.8metre',
  '1 metre 80 cm',
  'metre: 1.8',
  '(metre) 1.8',
  '180 cm (1.8 metre)',
  '6 ft = 1.83 metre',
];

// Mulberry32: a small seeded generator, so each run makes the same inputs.
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Each input has one to three chunks. Most chunks are a number and a unit, so most inputs look
// like a measurement, with other words around and between the parts.
function makeInputs(): string[] {
  const next = random(86);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)];
  const word = (groups: Groups): string => {
    let roll = next() * groups.reduce((sum, [weight]) => sum + weight, 0);
    return pick((groups.find(([weight]) => (roll -= weight) < 0) ?? groups[0])[1]);
  };
  const chunk = (): string => {
    const roll = next();
    if (roll < 0.6) return word(NUMBERS) + pick(JOINERS) + word(UNITS);
    return word(roll < 0.75 ? NUMBERS : roll < 0.85 ? UNITS : OTHERS);
  };
  const inputs = new Set<string>();
  while (inputs.size < INPUT_COUNT) {
    let input = chunk();
    for (let count = Math.floor(next() * 3); count > 0; count--) input += pick(JOINERS) + chunk();
    inputs.add(input);
  }
  return [...inputs, ...METRE_INPUTS];
}

function describeResult(raw: string, options: ParseOptions): string {
  try {
    const result = parseMeasurement(raw, options);
    if (!result) return 'null';
    // The parts show which numbers and units the result came from (AFA-87). One part with the
    // result's own value and unit adds nothing, so the line leaves it out.
    const total = `${result.value} ${result.unit}`;
    const parts = result.matches.map(({ value, unit }) => `${value} ${unit}`).join(' + ');
    return `${total} ${result.type}${parts === total ? '' : ` = ${parts}`}`;
  } catch (error) {
    return `throws: ${error instanceof Error ? error.message : String(error)}`;
  }
}

describe('result snapshot', () => {
  it('gives the same result for each generated input and option set', async () => {
    const lines = makeInputs().flatMap(raw =>
      OPTION_SETS.map(([name, options]) => `${raw}\t${name}\t${describeResult(raw, options)}`)
    );
    await expect(`${lines.join('\n')}\n`).toMatchFileSnapshot('__snapshots__/resultSnapshot.txt');
  });
});
