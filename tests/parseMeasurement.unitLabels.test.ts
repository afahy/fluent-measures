// AFA-250: recovery expectations now follow the approved complete-entry contract in PARSING.md.
// Earlier ticket rationales below describe their historical extraction contract; original
// assertions are retained separately under design/afa-250.
import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

describe('any unit as a label', () => {
  it.each([
    'age=28, kg=72',
    'age: 28, kg: 72',
    'age=28&kg=72',
    'age=28 kg=72',
    'age 28 kg: 72',
    'id=7, cm=180',
    'age: 30, lbs: 180',
    'id=7, pounds=180',
    'age: 28, ft: 6',
    'age 28, (kg) 72',
    'age=28, kg=72 lbs',
    'age=28, inches=72',
    'age 28, (") 72',
  ])('rejects the complete entry %s (AFA-250)', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it('rejects unrelated fields before a compound height', () => {
    expect(parseMeasurement('age: 28, ft: 5, in: 11')).toBeNull();
  });

  it.each(['age=28, kg=0', 'age=28, kg='])(
    "doesn't take the number before it when its own value is zero or missing, in %s",
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  it.each([
    ['72 kg: 180 cm', { type: 'weight' }],
    ['72 kg: height', {}],
  ] as const)('rejects the complete entry %s (AFA-250)', (raw, options) => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });

  it('returns null when the number before it disagrees with the next measurement', () => {
    expect(parseMeasurement('age 28 kg: 180 lbs')).toBeNull();
  });

  it.each([
    ['kg: 72 cm: 180', { type: 'weight' }],
    ['lbs: 180 m: 1.8', { type: 'weight' }],
    ['kg: 72, cm: 180', {}],
    ['(lbs) 180 m:', { type: 'weight' }],
  ] as const)('rejects the complete entry %s (AFA-250)', (raw, options) => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });
  it.each([['kg: 72, cm: 180', { type: 'weight' }, 72, 'kg']] as const)(
    'leaves a number to its label when another label follows it, in %s',
    (raw, options, value, unit) => {
      expect(parseMeasurement(raw, options)?.matches).toEqual([{ value, unit }]);
    }
  );

  it("doesn't take a number that has its own unit", () => {
    expect(parseMeasurement('Left foot: 27 cm')).toBeNull();
  });

  it('still reads a compound height with labels', () => {
    expect(parseMeasurement('6 (ft) 2 (in)')?.matches).toEqual([
      { value: 6, unit: 'ft' },
      { value: 2, unit: 'in' },
    ]);
    expect(parseMeasurement('5 ft: 11 in')).toBeNull();
  });

  // AFA-250 retires conversion reconciliation, including prefix and suffix label paths.
  it.each([
    '180 lbs = 82 kg',
    '80 kg: 175 lbs',
    '6 ft = 72 in',
    '180 cm = 5 ft 11 in',
    '180 (lbs), 82 (kg)',
    'in: 72, cm: 183',
    'kg 72 lbs 159',
  ])('rejects independent readings in %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it('still returns null for a stone part before a weight label', () => {
    expect(parseMeasurement('12 st, lb: 4')).toBeNull();
    expect(parseMeasurement('Stone: 12, lb: 4')).toBeNull();
  });

  it.each(['age=28, kg=400 g', 'age=28, lbs=8 oz', 'age=28, lbs=12 stone', 'age 28 kg: 400 g'])(
    "doesn't take a number in stone, ounces or grams, so %s returns null",
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  // Only brackets, ":", "=" and "in." make a label. The words "_unit" and "_name" are plain
  // words between the number and the unit, as "unit" is.
  it.each(['5 _unit kg', '5 _name in', '5 UNIT kg'])(
    'reads the words in %s as plain words',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );
});
