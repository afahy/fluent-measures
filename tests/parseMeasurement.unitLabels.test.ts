import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

describe('any unit as a label', () => {
  it.each([
    ['age=28, kg=72', 72, 'kg', 'weight'],
    ['age: 28, kg: 72', 72, 'kg', 'weight'],
    ['age=28&kg=72', 72, 'kg', 'weight'],
    ['age=28 kg=72', 72, 'kg', 'weight'],
    ['age 28 kg: 72', 72, 'kg', 'weight'],
    ['id=7, cm=180', 180, 'cm', 'height'],
    ['age: 30, lbs: 180', 180, 'lb', 'weight'],
    ['id=7, pounds=180', 180, 'lb', 'weight'],
    ['age: 28, ft: 6', 6, 'ft', 'height'],
    ['age 28, (kg) 72', 72, 'kg', 'weight'],
    ['age=28, kg=72 lbs', 72, 'lb', 'weight'],
    ['age=28, inches=72', 72, 'in', 'height'],
    ['age 28, (") 72', 72, 'in', 'height'],
  ] as const)('reads the number after it in %s', (raw, value, unit, type) => {
    expect(parseMeasurement(raw)).toEqual({ value, unit, type, raw, matches: [{ value, unit }] });
  });

  it('reads both parts of a height after earlier fields', () => {
    expect(parseMeasurement('age: 28, ft: 5, in: 11')?.matches).toEqual([
      { value: 5, unit: 'ft' },
      { value: 11, unit: 'in' },
    ]);
  });

  it.each(['age=28, kg=0', 'age=28, kg='])(
    "doesn't take the number before it when its own value is zero or missing, in %s",
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  it.each([
    ['180 lbs = 82 kg', {}, 180, 'lb'],
    ['80 kg: 175 lbs', {}, 80, 'kg'],
    ['6 ft = 72 in', {}, 6, 'ft'],
    ['180 cm = 5 ft 11 in', {}, 180, 'cm'],
    ['72 kg: 180 cm', { type: 'weight' }, 72, 'kg'],
    ['72 kg: height', {}, 72, 'kg'],
    ['180 (lbs), 82 (kg)', {}, 180, 'lb'],
  ] as const)(
    'takes the number before it when the number after it has its own unit, in %s',
    (raw, options, value, unit) => {
      expect(parseMeasurement(raw, options)?.matches).toEqual([{ value, unit }]);
    }
  );

  it('returns null when the number before it disagrees with the next measurement', () => {
    expect(parseMeasurement('age 28 kg: 180 lbs')).toBeNull();
  });

  it.each([
    ['kg: 72 cm: 180', { type: 'weight' }, 72, 'kg'],
    ['lbs: 180 m: 1.8', { type: 'weight' }, 180, 'lb'],
    ['kg: 72, cm: 180', { type: 'weight' }, 72, 'kg'],
    ['kg: 72, cm: 180', {}, 180, 'cm'],
    ['in: 72, cm: 183', {}, 72, 'in'],
    ['(lbs) 180 m:', { type: 'weight' }, 180, 'lb'],
  ] as const)(
    'leaves a number to its label when another label follows it, in %s',
    (raw, options, value, unit) => {
      expect(parseMeasurement(raw, options)?.matches).toEqual([{ value, unit }]);
    }
  );

  it("doesn't take a number that has its own unit", () => {
    expect(parseMeasurement('Left foot: 27 cm')?.matches).toEqual([{ value: 27, unit: 'cm' }]);
  });

  it('still reads a compound height with labels', () => {
    expect(parseMeasurement('6 (ft) 2 (in)')?.matches).toEqual([
      { value: 6, unit: 'ft' },
      { value: 2, unit: 'in' },
    ]);
    expect(parseMeasurement('5 ft: 11 in')?.matches).toEqual([
      { value: 5, unit: 'ft' },
      { value: 11, unit: 'in' },
    ]);
  });

  it('still lets a unit without a label take the number after it when another unit follows', () => {
    expect(parseMeasurement('kg 72 lbs 159')?.matches).toEqual([{ value: 72, unit: 'kg' }]);
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

  // Only brackets, ":", "=" and "in." make a label. The words "_unit" and "_name" marked one
  // before AFA-87, so "5 _unit kg" was 5 kg. Now they're plain words between the number and the
  // unit, as "unit" is.
  it.each(['5 _unit kg', '5 _name in', '5 UNIT kg'])(
    'reads the words in %s as plain words',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );
});
