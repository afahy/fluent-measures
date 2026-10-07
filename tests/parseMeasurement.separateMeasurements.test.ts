import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

describe('separate measurements in one input', () => {
  it.each([
    ['70 kg (154 lbs)', 70, 'kg', 'weight'],
    ['154 lbs (70 kg)', 154, 'lb', 'weight'],
    ['180 cm (5\'11")', 180, 'cm', 'height'],
    ['6 ft or 183 cm', 6, 'ft', 'height'],
    // A smaller part of one unit or more is a conversion, not part of a compound height
    ['6 ft (72 in)', 6, 'ft', 'height'],
    ['6 ft; 72 in', 6, 'ft', 'height'],
    ['6 ft = 72 inches', 6, 'ft', 'height'],
    ['1 m (100 cm)', 1, 'm', 'height'],
    ['1.8 m (180 cm)', 1.8, 'm', 'height'],
    // A compound starts from a whole number, so these are conversions too
    ['0.8 m (80 cm)', 0.8, 'm', 'height'],
    ['0.5 ft (6 in)', 0.5, 'ft', 'height'],
    ['0.5 m (50 cm)', 0.5, 'm', 'height'],
  ] as const)('returns the first of two agreeing measurements in %s', (raw, value, unit, type) => {
    expect(parseMeasurement(raw)).toEqual({ value, unit, type, raw, matches: [{ value, unit }] });
  });

  it('runs without Array.prototype.at, which the ES2020 target lacks', () => {
    const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'at');
    Reflect.deleteProperty(Array.prototype, 'at');
    try {
      expect(parseMeasurement('70 kg (154 lbs)')?.value).toBe(70);
    } finally {
      if (descriptor) Object.defineProperty(Array.prototype, 'at', descriptor);
    }
  });

  it.each([`${'9'.repeat(400)} kg; 1 kg`, `${'9'.repeat(400)} kg`, `1 kg; ${'9'.repeat(400)} kg`])(
    'returns null for a value too large to represent',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  it('converts only the first measurement to the requested unit', () => {
    const result = parseMeasurement('70 kg (154 lbs)', { normalizedUnit: 'lb' });
    expect(result?.value).toBeCloseTo(70 / 0.45359237);
    expect(result?.unit).toBe('lb');
    expect(result?.matches).toEqual([{ value: 70, unit: 'kg' }]);
  });

  it.each([
    ['210 lbs to 180 lbs', {}],
    ['M/28/5\'11" [210lbs > 180lbs]', { type: 'weight' }],
    // 150 lb is 68.04 kg, 2.8% from 70 kg
    ['70 kg (150 lbs)', {}],
    ['5 ft-1 m', {}],
    ['5 ft-1 m', { normalizedUnit: 'm' }],
    ['150 lbs - 180 lbs', {}],
    ['5 ft 10 cm', { normalizedUnit: 'cm' }],
    // 12 in or more after feet is a separate measurement, and it disagrees
    ['5 ft 12 in', {}],
    ['5 feet twenty one inches', {}],
    // A fractional larger part doesn't start a compound
    ['5.5 ft 2 in', {}],
  ] as const)('returns null for measurements that disagree in %s', (raw, options) => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });

  it.each(['5-60', '1-12'])(
    'keeps rejecting bare shorthand with 12 in or more, even when it agrees, in %s',
    raw => {
      expect(parseMeasurement(raw, { type: 'height' })).toBeNull();
    }
  );

  it.each([
    ['5 ft 11 in', 71, [5, 'ft'], [11, 'in']],
    ['5 ft 11.5 in', 71.5, [5, 'ft'], [11.5, 'in']],
    ['5\'11"', 71, [5, 'ft'], [11, 'in']],
    ['five foot ten', 70, [5, 'ft'], [10, 'in']],
    ['0-foot-11', 11, [0, 'ft'], [11, 'in']],
    ['5-foot-0-inches', 60, [5, 'ft'], [0, 'in']],
  ] as const)('keeps the compound height %s', (raw, value, feet, inches) => {
    expect(parseMeasurement(raw)).toEqual({
      value,
      unit: 'in',
      type: 'height',
      raw,
      matches: [
        { value: feet[0], unit: feet[1] },
        { value: inches[0], unit: inches[1] },
      ],
    });
  });

  it('keeps the compound height 1 m 80 cm', () => {
    const result = parseMeasurement('1 m 80 cm');
    expect(result?.value).toBe(180);
    expect(result?.unit).toBe('cm');
    expect(result?.matches).toEqual([
      { value: 1, unit: 'm' },
      { value: 80, unit: 'cm' },
    ]);
  });

  it('ignores a measurement that adds up to zero', () => {
    expect(parseMeasurement('0 feet; actual 1.8 meters')?.matches).toEqual([
      { value: 1.8, unit: 'm' },
    ]);
    expect(parseMeasurement('0 kg; actual 70 kg')?.matches).toEqual([{ value: 70, unit: 'kg' }]);
    // "m" can't take the number after it, so 0 m stays a measurement of its own.
    expect(parseMeasurement('0 m; actual 1.8 m')?.matches).toEqual([{ value: 1.8, unit: 'm' }]);
  });

  it('keeps a measurement with a zero part, as in 5 ft 0 in (152 cm)', () => {
    const result = parseMeasurement('5 ft 0 in (152 cm)');
    expect(result?.value).toBe(60);
    expect(result?.matches).toEqual([
      { value: 5, unit: 'ft' },
      { value: 0, unit: 'in' },
    ]);
  });

  it('looks for a weight when the only height adds up to zero', () => {
    expect(parseMeasurement('0 m, 180 lbs')?.matches).toEqual([{ value: 180, unit: 'lb' }]);
    expect(parseMeasurement('0 m')).toBeNull();
  });

  it.each([
    ['100 cm (101 cm)', 100],
    // Decimals whose difference is exactly 1% but rounds to slightly more
    ['1 m; 1.01 m', 1],
    ['70 kg; 70.7 kg', 70],
    ['0.3 m (0.303 m)', 0.3],
  ])('accepts a difference of exactly 1% in %s', (raw, value) => {
    expect(parseMeasurement(raw)?.value).toBe(value);
  });

  it.each(['100 cm (101.1 cm)', '1 m; 1.0101 m'])(
    'rejects a difference of more than 1% in %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );
});
