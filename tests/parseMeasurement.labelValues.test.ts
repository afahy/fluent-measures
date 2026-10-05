import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

describe('a label reads the number after it', () => {
  it.each([
    ['age=28, in=72', 72, 'in'],
    ['age: 28, in: 72', 72, 'in'],
    ['age=28&in=72', 72, 'in'],
    ['id=7, m=1.8', 1.8, 'm'],
    ['age: 30, m: 1.8', 1.8, 'm'],
    ['age 28, Height (in): 72', 72, 'in'],
    ['age 28 (in): 72', 72, 'in'],
    ['id 7 (m): 1.8', 1.8, 'm'],
    ['age 28 in. 72', 72, 'in'],
  ] as const)('instead of an earlier field in %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toEqual({
      value,
      unit,
      type: 'height',
      raw,
      matches: [{ value, unit }],
    });
  });

  it.each([
    ['72 (in)', 72],
    ['Height (in): 72', 72],
    ['in: 72', 72],
    ['72 in: height', 72],
  ])('falls back to the number before it only when none follows, in %s', (raw, value) => {
    expect(parseMeasurement(raw)?.matches).toEqual([{ value, unit: 'in' }]);
  });

  it('keeps a compound height with an inch abbreviation', () => {
    expect(parseMeasurement('5 ft 11 in.')?.matches).toEqual([
      { value: 5, unit: 'ft' },
      { value: 11, unit: 'in' },
    ]);
  });

  it('keeps consecutive label fields as one height', () => {
    const result = parseMeasurement('m: 1 cm: 80');
    expect(result?.value).toBeCloseTo(180 / 2.54);
    expect(result?.matches).toEqual([
      { value: 1, unit: 'm' },
      { value: 80, unit: 'cm' },
    ]);
  });

  it.each([
    ['72 (in), 180 lbs', {}, 72, 'in'],
    ['72 (in), 180 lbs', { type: 'height' }, 72, 'in'],
    ['72 (in) 180 lbs', {}, 72, 'in'],
    ['72 in. 180 lbs', {}, 72, 'in'],
    ['1.8 (m), 80 kg', {}, 1.8, 'm'],
  ] as const)(
    'reads the number before a bracket label when the next number has its own unit, in %s',
    (raw, options, value, unit) => {
      expect(parseMeasurement(raw, options)?.matches).toEqual([{ value, unit }]);
    }
  );

  it.each([
    ['age=28, in=180 lbs', 180, 'lb'],
    ['age=28; in=180 lbs', 180, 'lb'],
    ['age=28&in=180 lbs', 180, 'lb'],
    ['age=28, (in) 180 lbs', 180, 'lb'],
    ['age=28, in=72 cm', 72, 'cm'],
    ['age: 28, m: 80 kg', 80, 'kg'],
  ] as const)(
    "doesn't take an earlier field's number after a separator, in %s",
    (raw, value, unit) => {
      expect(parseMeasurement(raw)?.matches).toEqual([{ value, unit }]);
    }
  );

  it.each([
    ['72 in: 180 lbs', 180, 'lb'],
    ['age=28 in=180 lbs', 180, 'lb'],
    ['age 28 in=180 lbs', 180, 'lb'],
    ['age: 28 in: 180 lbs', 180, 'lb'],
    ['age 28 in: 180 lbs', 180, 'lb'],
    ['age=28 in=72 cm', 72, 'cm'],
  ] as const)(
    "doesn't give a field name the number before it when a number follows, in %s",
    (raw, value, unit) => {
      expect(parseMeasurement(raw)?.matches).toEqual([{ value, unit }]);
    }
  );

  it.each(['age=28, in=0', 'id=7, m=0', 'age 28 in=0', 'age=28, in:'])(
    "doesn't take the number before it when its own value is zero or missing, in %s",
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  it('still leaves a number that has its own unit to that unit', () => {
    expect(parseMeasurement('age 28, weigh in: 180 lbs')?.matches).toEqual([
      { value: 180, unit: 'lb' },
    ]);
    expect(parseMeasurement('M: 5\'11"')?.matches).toEqual([
      { value: 5, unit: 'ft' },
      { value: 11, unit: 'in' },
    ]);
  });
});
