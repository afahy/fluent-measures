// AFA-250: recovery expectations now follow the approved complete-entry contract in PARSING.md.
// Earlier ticket rationales below describe their historical extraction contract; original
// assertions are retained separately under design/afa-250.
import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

// AFA-107: these decimal strings are positive before conversion. The first is the ticket's
// 1e-323 input; the second rounds to the smallest positive binary64 value, 2 ** -1074.
const tiny = `0.${'0'.repeat(322)}1`;
const smallest = `0.${'0'.repeat(323)}5`;

describe('conversion underflow', () => {
  describe.each([false, true])('default-unit underflow with explicit type: %s', withType => {
    // One smallest subnormal pound times 0.45359237 rounds below half a subnormal kilogram.
    it.each([
      [tiny, 'height', 'ft'],
      [tiny, 'height', 'm'],
      [smallest, 'height', 'ft'],
      [smallest, 'height', 'm'],
      [smallest, 'weight', 'kg'],
    ] as const)('rejects %s (%s to %s)', (raw, type, normalizedUnit) => {
      expect(Number(raw)).toBeGreaterThan(0);
      expect(
        parseMeasurement(raw, {
          type: withType ? type : undefined,
          defaultUnit: type === 'height' ? 'in' : 'lb',
          normalizedUnit,
        })
      ).toBeNull();
    });
  });

  it.each([false, true])('preserves positive results with explicit type: %s', withType => {
    expect.assertions(3);
    for (const [normalizedUnit, expected, unit] of [
      [undefined, 1e-323, 'in'],
      ['in', 1e-323, 'in'],
      ['cm', 2.5e-323, 'cm'],
    ] as const) {
      // Two smallest subnormal inches times 2.54 round to five subnormal centimeters.
      expect(
        parseMeasurement(tiny, {
          type: withType ? 'height' : undefined,
          defaultUnit: 'in',
          normalizedUnit,
        })
      ).toEqual({
        value: expected,
        unit,
        type: 'height',
        matches: [{ value: 1e-323, unit: 'in' }],
        raw: tiny,
      });
    }
  });

  // Each expected value follows from rounding to multiples of 2 ** -1074:
  // 7 / 12 -> 1; round(20 * 2.54) / 100 -> 1; 2 * 0.45359237 -> 1.
  it.each([
    [`0.${'0'.repeat(322)}35`, 'height', 'ft'],
    [`0.${'0'.repeat(321)}1`, 'height', 'm'],
    [tiny, 'weight', 'kg'],
  ] as const)(
    'preserves a smallest positive converted result in %s (%s to %s)',
    (raw, type, normalizedUnit) => {
      expect(
        parseMeasurement(raw, {
          type,
          defaultUnit: type === 'height' ? 'in' : 'lb',
          normalizedUnit,
        })?.value
      ).toBe(Number.MIN_VALUE);
    }
  );

  it('preserves tiny values with an explicit meter default', () => {
    // Two subnormal meters times 100 are exactly 200 subnormal centimeters.
    expect(
      parseMeasurement(tiny, {
        type: 'height',
        defaultUnit: 'm',
        normalizedUnit: 'cm',
      })
    ).toEqual({
      value: 200 * Number.MIN_VALUE,
      unit: 'cm',
      type: 'height',
      matches: [{ value: 1e-323, unit: 'm' }],
      raw: tiny,
    });
  });

  it.each(['in', 'inch', 'inches', '"'] as const)('keeps explicit %s underflow rejected', unit => {
    expect.assertions(2);
    for (const normalizedUnit of ['ft', 'm'] as const) {
      expect(parseMeasurement(`${tiny} ${unit}`, { normalizedUnit })).toBeNull();
    }
  });

  it('keeps explicit weight underflow rejected', () => {
    expect(parseMeasurement(`${smallest} lb`, { normalizedUnit: 'kg' })).toBeNull();
  });

  it('rejects standalone zero height before a valid weight', () => {
    expect(parseMeasurement('0 feet 0 inches; weight 70 kg')).toBeNull();
  });
});
