import fc from 'fast-check';
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

const input = fc
  .array(fc.constantFrom(...WORDS), { minLength: 1, maxLength: 6 })
  .chain(words =>
    fc
      .array(fc.constantFrom(' ', ''), { minLength: words.length - 1, maxLength: words.length - 1 })
      .map(joins => words.reduce((text, word, at) => text + (at ? joins[at - 1] : '') + word))
  );

// normalizedUnit selects the type, and a normalizedUnit of the other type throws on purpose, so the
// options only pair a type with its own units.
const options: fc.Arbitrary<ParseOptions> = fc
  .record({
    type: fc.option(fc.constantFrom<MeasurementType>('height', 'weight'), { nil: undefined }),
    unitType: fc.constantFrom<MeasurementType>('height', 'weight'),
    unitAt: fc.nat(3),
    withUnit: fc.boolean(),
    fuzziness: fc.option(fc.integer({ min: 0, max: 2 }), { nil: undefined }),
  })
  .map(({ type, unitType, unitAt, withUnit, fuzziness }) => {
    const units = UNITS[type ?? unitType];
    return {
      type,
      normalizedUnit: withUnit ? units[unitAt % units.length] : undefined,
      fuzziness,
    };
  });

describe('invariants', () => {
  it('never throws, and gives null or a finite value above 0 in a unit of its type', () => {
    fc.assert(
      fc.property(input, options, (raw, parseOptions) => {
        const result = parseMeasurement(raw, parseOptions);
        if (result === null) return;
        expect(typeof result.value).toBe('number');
        expect(Number.isFinite(result.value)).toBe(true);
        expect(result.value).toBeGreaterThan(0);
        expect(UNITS[result.type]).toContain(result.unit);
        // A type or a normalizedUnit in the options decides the result's type or unit.
        expect(result.type).toBe(parseOptions.type ?? result.type);
        expect(result.unit).toBe(parseOptions.normalizedUnit ?? result.unit);
      }),
      { numRuns: 2000, seed: 26 }
    );
  });

  // The options that the property leaves out throw on purpose (AFA-7).
  it('throws for a normalizedUnit of the other type', () => {
    expect(() => parseMeasurement('180 cm', { type: 'height', normalizedUnit: 'kg' })).toThrow(
      'normalizedUnit kg is not a height unit'
    );
  });
});
