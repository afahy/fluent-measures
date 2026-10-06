import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions, type Unit } from '../src';

// The size of each unit in centimeters or kilograms, from 1 in = 2.54 cm and 1 lb = 0.45359237 kg.
const SIZES: Array<Partial<Record<Unit, number>>> = [
  { ft: 30.48, in: 2.54, cm: 1, m: 100 },
  { lb: 0.45359237, kg: 1 },
];
const PAIRS = SIZES.flatMap(sizes =>
  Object.entries(sizes).flatMap(([from, fromSize]) =>
    Object.entries(sizes).map(([to, toSize]) => [from, to as Unit, fromSize / toSize] as const)
  )
);

// Inputs and results from AFA-6. The maintainer chose option (a) for both of its questions.
describe('unit conversions', () => {
  it.each([
    ['6 ft', { normalizedUnit: 'm' }, 1.8288, 'm'], // 72 × 0.0254
    ['5\' 11"', { normalizedUnit: 'm' }, 1.8034, 'm'], // 71 × 0.0254
    ['1.8 m', { normalizedUnit: 'in' }, 180 / 2.54, 'in'],
    ['1 m 80 cm', {}, 180, 'cm'],
  ] as const)('reads %s with %o as %s %s', (raw, options, value, unit) => {
    const result = parseMeasurement(raw, options);
    expect(result?.unit).toBe(unit);
    expect(result?.value).toBeCloseTo(value, 10);
  });

  it.each(PAIRS)('converts 1 %s to %s', (from, to, factor) => {
    const result = parseMeasurement(`1 ${from}`, { normalizedUnit: to });
    expect(result?.unit).toBe(to);
    expect(result?.value).toBeCloseTo(factor, 10);
  });

  // A measurement with several parts keeps the unit system of its parts.
  it.each([
    ['2 meters 5 centimeters', 205, 'cm'],
    ['5 ft 11 in', 71, 'in'],
    ['5 ft 0 in', 60, 'in'],
  ] as const)('reads %s as %s %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit, type: 'height' });
  });

  // normalizedUnit selects the type, so an input without that type has no measurement.
  it.each([
    ['6 ft', 'kg'],
    ['180 lbs', 'cm'],
    ['72 in', 'lb'],
  ] as const)('returns null for %s with normalizedUnit %s', (raw, normalizedUnit) => {
    expect(parseMeasurement(raw, { normalizedUnit })).toBeNull();
  });

  it.each([
    ['6 ft, 80 kg', 'kg', 80, 'weight'],
    ['6 ft, 180 lbs', 'kg', 81.6466266, 'weight'], // 180 × 0.45359237
    ['80 kg, 6 ft', 'cm', 182.88, 'height'], // 72 × 2.54
  ] as const)('reads %s with normalizedUnit %s as %s', (raw, normalizedUnit, value, type) => {
    const result = parseMeasurement(raw, { normalizedUnit });
    expect(result).toMatchObject({ unit: normalizedUnit, type });
    expect(result?.value).toBeCloseTo(value, 10);
  });

  // Contradicting options throw for any input with a token, as allowUnqualified without type does.
  it.each([
    ['6 ft', { type: 'height', normalizedUnit: 'kg' }, 'normalizedUnit kg is not a height unit'],
    ['hello', { type: 'height', normalizedUnit: 'kg' }, 'normalizedUnit kg is not a height unit'],
    ['80 kg', { type: 'weight', normalizedUnit: 'cm' }, 'normalizedUnit cm is not a weight unit'],
  ] as const)('throws for %s with %o', (raw, options: ParseOptions, message) => {
    expect(() => parseMeasurement(raw, options)).toThrow(message);
  });

  // normalizedUnit doesn't count as a type for allowUnqualified.
  it.each([
    ['hello', { allowUnqualified: true }],
    ['72', { allowUnqualified: true, normalizedUnit: 'cm' }],
  ] as const)('throws for %s with %o, which has no type', (raw, options: ParseOptions) => {
    expect(() => parseMeasurement(raw, options)).toThrow('allowUnqualified requires type');
  });

  // The tokenizer drops a lone comma, so this input has no token and returns null.
  it('returns null for an input without a token, even with contradicting options', () => {
    expect(parseMeasurement(',', { type: 'height', normalizedUnit: 'kg' })).toBeNull();
  });

  // JavaScript callers can pass values that TypeScript rejects.
  it('treats an empty type as no type', () => {
    const options = { type: '', normalizedUnit: 'kg' } as unknown as ParseOptions;
    expect(parseMeasurement('6 ft', options)).toBeNull();
  });

  it('still throws for a normalizedUnit that has no conversion', () => {
    const options = { normalizedUnit: 'st' } as unknown as ParseOptions;
    expect(() => parseMeasurement('6 ft', options)).toThrow('Cannot convert ft to st');
  });

  it('keeps a normalizedUnit of the requested type', () => {
    const result = parseMeasurement('80 kg', { type: 'weight', normalizedUnit: 'lb' });
    expect(result?.unit).toBe('lb');
    expect(result?.value).toBeCloseTo(80 / 0.45359237, 10);
  });
});
