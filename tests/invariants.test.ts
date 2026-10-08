import fc from 'fast-check';
import { env } from 'node:process';
import { describe, expect, it } from 'vitest';
import { parseMeasurement, type MeasurementType, type ParseOptions, type Unit } from '../src';

// AFA-26: one rule covers every input. parseMeasurement doesn't throw for consistent options, and
// it returns null or a finite value above 0 in a unit of the reported type. The words come from a
// fixed list, because random strings almost never make units, number words or prototype keys.
const WORDS = [
  // Numbers, number words and signs.
  '5',
  '11',
  '180',
  '1.8',
  '72.5',
  // A number too large for a float, and one so small that it reads as 0.
  '9'.repeat(400),
  `0.${'0'.repeat(330)}1`,
  '0',
  '-3',
  '1/2',
  '½',
  'five',
  'ten',
  'hundred',
  'and',
  'a',
  'half',
  // Units, marks and labels.
  'ft',
  'feet',
  'foot',
  "'",
  '"',
  'in',
  'inches',
  'cm',
  'm',
  'meters',
  'metres',
  'lb',
  'lbs',
  'pounds',
  '#',
  'kg',
  'kilos',
  '(kg)',
  'kg:',
  'st',
  'oz',
  // Prototype keys, other words and separators.
  'constructor',
  '__proto__',
  'toString',
  'was',
  'food',
  ',',
  ';',
  '-',
];

// The units of each type, written out here so that the check doesn't use src/.
const UNITS: Record<MeasurementType, readonly Unit[]> = {
  height: ['ft', 'in', 'cm', 'm'],
  weight: ['lb', 'kg'],
};

// One to six words, each joined to the word before it by a space or by nothing, so compact forms
// such as "5ft" occur too.
const input = fc
  .array(fc.tuple(fc.constantFrom(' ', ''), fc.constantFrom(...WORDS)), {
    minLength: 1,
    maxLength: 6,
  })
  .map(pairs => pairs.map(([join, word], at) => (at ? join : '') + word).join(''));

// normalizedUnit selects the type, and a normalizedUnit of the other type throws on purpose, as
// tests/parseMeasurement.unitConversions.test.ts checks. So the options only pair a type with its
// own units. allowUnqualified without a type throws on purpose too, so it comes only with a type.
const options: fc.Arbitrary<ParseOptions> = fc
  .record({
    type: fc.option(fc.constantFrom<MeasurementType>('height', 'weight'), { nil: undefined }),
    unitType: fc.constantFrom<MeasurementType>('height', 'weight'),
    unitAt: fc.nat(3),
    withUnit: fc.boolean(),
    allowUnqualified: fc.boolean(),
    inferUnit: fc.option(fc.constantFrom('metric' as const, 'imperial' as const), {
      nil: undefined,
    }),
    fuzziness: fc.option(fc.integer({ min: 0, max: 2 }), { nil: undefined }),
  })
  .map(({ type, unitType, unitAt, withUnit, allowUnqualified, inferUnit, fuzziness }) => {
    const units = UNITS[type ?? unitType];
    return {
      type,
      normalizedUnit: withUnit ? units[unitAt % units.length] : undefined,
      allowUnqualified: allowUnqualified && type !== undefined,
      inferUnit,
      fuzziness,
    };
  });

// Stryker runs each test again for every mutant that it covers, and this test covers nearly all of
// them. With 2000 inputs, the property killed no mutant that the other tests miss. So Stryker's
// workers, which set STRYKER_MUTATOR_WORKER, run 100 inputs, and every other run checks 2000.
const NUM_RUNS = env.STRYKER_MUTATOR_WORKER === undefined ? 2000 : 100;

describe('invariants', () => {
  it('never throws, and gives null or a finite value above 0 in a unit of its type', () => {
    // The lint asks for a count because some expects are in a callback. Their number depends on
    // how many generated inputs give a result, so this gives no exact count.
    expect.hasAssertions();
    const types: MeasurementType[] = [];
    fc.assert(
      fc.property(input, options, (raw, parseOptions) => {
        const result = parseMeasurement(raw, parseOptions);
        if (result === null) return;
        types.push(result.type);
        expect(typeof result.value).toBe('number');
        expect(Number.isFinite(result.value)).toBe(true);
        expect(result.value).toBeGreaterThan(0);
        expect(UNITS[result.type]).toContain(result.unit);
        // A type or a normalizedUnit in the options decides the result's type or unit.
        expect(result.type).toBe(parseOptions.type ?? result.type);
        expect(result.unit).toBe(parseOptions.normalizedUnit ?? result.unit);
      }),
      { numRuns: NUM_RUNS, seed: 26 }
    );
    // Most inputs give null, so check that some give each type, or a parser that returns null for
    // every input would pass.
    expect(types).toContain('height');
    expect(types).toContain('weight');
  });
});
