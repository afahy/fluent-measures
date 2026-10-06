import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

describe('the word "in" before a number', () => {
  it.each([
    ['lost 5 lbs in 3 weeks', 5, 'lb', 'weight'],
    ['weighed 70 kg in 2020', 70, 'kg', 'weight'],
    ['I was 180 lbs in 2019', 180, 'lb', 'weight'],
    ['gained 10 kg in six months', 10, 'kg', 'weight'],
    ['in 2024 I weighed 80 kg', 80, 'kg', 'weight'],
    ['IN 2020 I weighed 80 kg', 80, 'kg', 'weight'],
    ['born in 1990, 180 cm', 180, 'cm', 'height'],
    ['weighed 70 kg (in 2020)', 70, 'kg', 'weight'],
  ] as const)('reads "in" as a preposition in %s', (raw, value, unit, type) => {
    expect(parseMeasurement(raw)).toEqual({ value, unit, type, raw, matches: [{ value, unit }] });
  });

  it.each(['in 5', 'height in 72'])('returns null without a label in %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it('finds no height when the only "in" is a preposition', () => {
    expect(parseMeasurement('weighed 70 kg in 2020', { type: 'height' })).toBeNull();
  });

  it('reads ft 5 in 11 as feet only, because "in" no longer takes the number after it', () => {
    const raw = 'ft 5 in 11';
    expect(parseMeasurement(raw)).toEqual({
      value: 5,
      unit: 'ft',
      type: 'height',
      raw,
      matches: [{ value: 5, unit: 'ft' }],
    });
  });

  it.each([
    ['kg 70', 70, 'kg', 'weight'],
    ['cm 180', 180, 'cm', 'height'],
    ['ft 6', 6, 'ft', 'height'],
    ['inches 70', 70, 'in', 'height'],
  ] as const)('still reads other units before their number in %s', (raw, value, unit, type) => {
    expect(parseMeasurement(raw)).toEqual({ value, unit, type, raw, matches: [{ value, unit }] });
  });

  it.each([
    ['5 in', 5],
    ['70 in', 70],
  ])('still reads "in" after a number as inches in %s', (raw, value) => {
    expect(parseMeasurement(raw)).toEqual({
      value,
      unit: 'in',
      type: 'height',
      raw,
      matches: [{ value, unit: 'in' }],
    });
  });

  it('still reads 5 ft 11 in as a compound height', () => {
    const raw = '5 ft 11 in';
    expect(parseMeasurement(raw)).toEqual({
      value: 71,
      unit: 'in',
      type: 'height',
      raw,
      matches: [
        { value: 5, unit: 'ft' },
        { value: 11, unit: 'in' },
      ],
    });
  });
});

describe('the letter "m" before a number', () => {
  it.each(['M 28', 'Sex: M, Age: 28'])('returns null for a sex marker and an age in %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it('finds the weight after a sex marker and an age', () => {
    const raw = 'm 28, 180 lbs';
    expect(parseMeasurement(raw)).toEqual({
      value: 180,
      unit: 'lb',
      type: 'weight',
      raw,
      matches: [{ value: 180, unit: 'lb' }],
    });
  });

  it('reads only the height in M/28/5\'11"', () => {
    const raw = 'M/28/5\'11"';
    expect(parseMeasurement(raw)).toEqual({
      value: 71,
      unit: 'in',
      type: 'height',
      raw,
      matches: [
        { value: 5, unit: 'ft' },
        { value: 11, unit: 'in' },
      ],
    });
  });
});

describe('unit labels before a number', () => {
  it.each([
    ['Height (in): 72', 72, 'in'],
    ['height (in) 72', 72, 'in'],
    ['height (IN): 72', 72, 'in'],
    ['[in] 72', 72, 'in'],
    ['in: 72', 72, 'in'],
    ['Height in: 72', 72, 'in'],
    ['Height (in.): 72', 72, 'in'],
    ['in. 5', 5, 'in'],
    ['Height (m): 1.8', 1.8, 'm'],
    ['m: 1.8', 1.8, 'm'],
    ['Height in = 72', 72, 'in'],
    ['in=72', 72, 'in'],
    ['m = 1.8', 1.8, 'm'],
  ] as const)('reads the label in %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toEqual({
      value,
      unit,
      type: 'height',
      raw,
      matches: [{ value, unit }],
    });
  });

  it('reads every label in an input, not only the first', () => {
    expect(parseMeasurement('Unit (in), height (in): 72')?.value).toBe(72);
  });

  it('reads a label when the height type is given', () => {
    expect(parseMeasurement('Height (in): 72', { type: 'height' })?.value).toBe(72);
  });

  it.each(['Weigh in: 180 lbs', 'Weigh in: 180; lbs'])(
    'leaves a number with its own unit to that unit in %s',
    raw => {
      expect(parseMeasurement(raw)).toEqual({
        value: 180,
        unit: 'lb',
        type: 'weight',
        raw,
        matches: [{ value: 180, unit: 'lb' }],
      });
    }
  );

  it('reads a bracket label padded with many spaces in linear time', () => {
    const raw = `(${' '.repeat(200000)}in) 72`;
    const start = performance.now();
    expect(parseMeasurement(raw)?.value).toBe(72);
    // A quadratic pattern takes seconds here on Node 22, and this takes milliseconds.
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it.each(['M: 5\'11"', 'M: 5 ft 11 in'])('reads a sex marker label as a letter in %s', raw => {
    expect(parseMeasurement(raw)).toEqual({
      value: 71,
      unit: 'in',
      type: 'height',
      raw,
      matches: [
        { value: 5, unit: 'ft' },
        { value: 11, unit: 'in' },
      ],
    });
  });

  it.each(['m: 1 cm: 80', 'Height m: 1, cm: 80', 'm: 1 cm; 80'])(
    'reads consecutive label fields as one height in %s',
    raw => {
      const result = parseMeasurement(raw);
      expect(result?.value).toBeCloseTo(180 / 2.54);
      expect(result?.unit).toBe('in');
      expect(result?.matches).toEqual([
        { value: 1, unit: 'm' },
        { value: 80, unit: 'cm' },
      ]);
    }
  );

  it('leaves a number with centimeters to centimeters in Height (m): 180 cm', () => {
    const raw = 'Height (m): 180 cm';
    expect(parseMeasurement(raw)).toEqual({
      value: 180,
      unit: 'cm',
      type: 'height',
      raw,
      matches: [{ value: 180, unit: 'cm' }],
    });
  });

  it('reads consecutive feet and inch fields in ft: 5 in: 11', () => {
    expect(parseMeasurement('ft: 5 in: 11')?.matches).toEqual([
      { value: 5, unit: 'ft' },
      { value: 11, unit: 'in' },
    ]);
  });

  it.each([
    'check-in: 5',
    'weigh-in: 180',
    'sign-in: 2020',
    'check-in. 5',
    // Non-breaking hyphen, hyphen and en dash
    'check‑in: 5',
    'check‐in: 5',
    'check–in: 5',
    'weigh‑in. 180',
  ])('does not read the end of a hyphenated word as a label in %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it('still finds the weight after a hyphenated word in weigh-in: 180 lbs', () => {
    expect(parseMeasurement('weigh-in: 180 lbs')?.matches).toEqual([{ value: 180, unit: 'lb' }]);
  });
});
