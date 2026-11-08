// AFA-250: recovery expectations now follow the approved complete-entry contract in PARSING.md.
// Earlier ticket rationales below describe their historical extraction contract; original
// assertions are retained separately under design/afa-250.
import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

describe('separate measurements in one input', () => {
  it.each([
    '70 kg (154 lbs)',
    '154 lbs (70 kg)',
    '180 cm (5\'11")',
    '6 ft or 183 cm',
    // A smaller part of one unit or more is a conversion, not part of a compound height
    '6 ft (72 in)',
    '6 ft; 72 in',
    '6 ft = 72 inches',
    '1 m (100 cm)',
    '1.8 m (180 cm)',
    // A compound starts from a whole number, so these are conversions too
    '0.8 m (80 cm)',
    '0.5 ft (6 in)',
    '0.5 m (50 cm)',
  ] as const)('rejects two agreeing measurements in %s', raw => {
    // AFA-250 intentionally retires the first-result/1% policy. Keep the historical inputs.
    expect(parseMeasurement(raw)).toBeNull();
  });

  it('runs without Array.prototype.at, which the ES2020 target lacks', () => {
    const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'at');
    Reflect.deleteProperty(Array.prototype, 'at');
    try {
      expect(parseMeasurement('70 kg')?.value).toBe(70);
      expect(parseMeasurement('70 kg (154 lbs)')).toBeNull();
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

  it('rejects duplicates before normalization', () => {
    expect(parseMeasurement('70 kg (154 lbs)', { normalizedUnit: 'lb' })).toBeNull();
  });

  it.each([
    ['210 lbs to 180 lbs', {}],
    ['M/28/5\'11" [210lbs > 180lbs]', { type: 'weight' }],
    // 150 lb is about 68.04 kg, 2.8% from 70 kg
    ['70 kg (150 lbs)', {}],
    ['5 ft-1 m', {}],
    ['5 ft-1 m', { normalizedUnit: 'm' }],
    ['150 lbs - 180 lbs', {}],
    ['5 ft 10 cm', { normalizedUnit: 'cm' }],
    // 12 in or more after feet is a separate measurement.
    ['5 ft 12 in', {}],
    ['5 feet twenty one inches', {}],
    // A fractional larger part doesn't start a compound
    ['5.5 ft 2 in', {}],
  ] as const)('returns null for independent measurements in %s', (raw, options) => {
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

  it('rejects a zero measurement before another reading', () => {
    expect(parseMeasurement('0 feet; actual 1.8 meters')).toBeNull();
    expect(parseMeasurement('0 kg; actual 70 kg')).toBeNull();
    // "m" can't take the number after it, so 0 m stays a measurement of its own.
    // AFA-250: once both readings reach grouping, even a zero group cannot be discarded.
    expect(parseMeasurement('0 m; actual 1.8 m')).toBeNull();
  });

  it('rejects a second height after a compound with a zero part', () => {
    expect(parseMeasurement('5 ft 0 in (152 cm)')).toBeNull();
  });

  it('rejects zero height instead of selecting the weight', () => {
    expect(parseMeasurement('0 m, 180 lbs')).toBeNull();
    expect(parseMeasurement('0 m')).toBeNull();
  });

  it.each([
    '100 cm (101 cm)',
    // Decimals whose difference is exactly 1% but rounds to slightly more
    '1 m; 1.01 m',
    '70 kg; 70.7 kg',
    '0.3 m (0.303 m)',
  ])('rejects a difference of exactly 1% in %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it.each(['100 cm (101.1 cm)', '1 m; 1.0101 m'])(
    'rejects a difference of more than 1% in %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );
});

// AFA-165: 0 ft 0 in is one measurement of zero, which doesn't count, as in PARSING.md's
// `0 feet; actual 1.8 meters` (1.8 m). So the result is 5 in, and its matches hold only that part.
describe('a zero measurement before another one', () => {
  it('rejects separate zero fragments instead of dropping their matches', () => {
    expect(parseMeasurement('0 ft 0 in, 5 in')).toBeNull();
  });
});
