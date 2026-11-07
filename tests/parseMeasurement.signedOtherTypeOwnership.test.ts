import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions } from '../src';

const weightOptions: ParseOptions[] = [{}, { type: 'weight' }, { normalizedUnit: 'kg' }];

describe.each(weightOptions)('signed other-type ownership with %o', options => {
  // AFA-116: the signed feet value owns its unit; neither kg prefix owns that value.
  it.each(['kg -6 ft, 70 kg', 'kilograms -6 ft, 70 kg'])(
    'keeps the independent weight in %s',
    raw => {
      expect(parseMeasurement(raw, options)).toEqual({
        value: 70,
        unit: 'kg',
        type: 'weight',
        raw,
        matches: [{ value: 70, unit: 'kg' }],
      });
    }
  );

  // The same ownership rule applies to number words, supported marks, decimal/fractional
  // magnitudes, and internal semicolons (PARSING.md, Numbers, Units and Semicolons).
  it.each([
    'kg -six feet, 70 kg',
    'kg -six and a half feet, 70 kg',
    'kg -6.5 ft, 70 kg',
    'kg -1/2 ft, 70 kg',
    "kg -6', 70 kg",
    'pounds -180 cm, 70 kg',
    'kg; -6 ft, 70 kg',
    'kg -6; ft, 70 kg',
    'kg -6 ft; actual 70 kg',
    'record kg -6 ft, weight 70 kg',
  ])('keeps 70 kg after the signed height in %s', raw => {
    expect(parseMeasurement(raw, options)).toMatchObject({ value: 70, unit: 'kg', type: 'weight' });
  });
});

describe('signed other-type ownership controls', () => {
  // Ticket preservation cases, including unsigned behavior explicitly excluded from this fix.
  it.each([
    ['kg 6 ft, 70 kg', 6, 'ft'],
    ['kilograms 6 ft, 70 kg', 6, 'ft'],
    ['-5 ft, 150 lbs', 150, 'lb'],
    ['kg: -6 ft, 70 kg', 70, 'kg'],
    ['in: -180 lbs, 72 in', 72, 'in'],
    // Reversing the types follows the same signed-field rule from AFA-90 and AFA-116.
    ['centimeters -180 lbs, 180 cm', 180, 'cm'],
    ['feet -70 kg, 6 ft', 6, 'ft'],
    // Public label/semicolon and short-alias rules remain in force.
    ['in -5 degrees, 70 kg', 70, 'kg'],
    ['record 0; kg 70', 70, 'kg'],
    ['kg -5; actual 70 kg', 70, 'kg'],
    // Same-type ownership is outside this fix: the signed prefix spans the first two fields.
    ['70 kg, kg; -5 lb; actual 80 kg', 80, 'kg'],
  ] as const)('reads %s as %s %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit });
  });

  // An owned negative part still rejects its own field, with or without a following unit.
  it.each([
    'kg -6, 70 kg',
    'kg -6 kg, 70 kg',
    'kg -6 pounds, 70 kg',
    'kg -6 grams, 70 kg',
    'kg -6 ft, -70 kg',
    'feet -5 inches, 6 ft',
  ])('rejects the signed field in %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it('keeps a rejected height rejected when height is requested', () => {
    expect(parseMeasurement('kg -6 ft, 70 kg', { type: 'height' })).toBeNull();
  });

  it('recognizes a fuzzy other-type unit before rejecting the prefix field', () => {
    expect(parseMeasurement('kg -6 foots, 70 kg', { fuzziness: 1 })).toMatchObject({
      value: 70,
      unit: 'kg',
      type: 'weight',
    });
  });

  it('rejects an owned signed value without a following unit with fuzziness enabled', () => {
    expect(parseMeasurement('pound-0.75', { fuzziness: 2 })).toBeNull();
  });

  it('converts only the surviving weight using 1 lb = 0.45359237 kg', () => {
    expect(parseMeasurement('kg -6 ft, 150 lbs', { normalizedUnit: 'kg' })).toMatchObject({
      value: 68.0388555,
      unit: 'kg',
      type: 'weight',
      matches: [{ value: 150, unit: 'lb' }],
    });
  });

  // The generated result inventory reaches the same ownership boundary through a prime.
  // The first mark owns 1000 ft; the next cannot own the signed pounds. 1000 * 30.48 = 30480.
  it.each([
    [{}, 1000, 'ft'],
    [{ type: 'height' }, 1000, 'ft'],
    [{ normalizedUnit: 'cm' }, 30480, 'cm'],
    [{ fuzziness: 2 }, 1000, 'ft'],
    [{ type: 'height', allowUnqualified: true, inferUnit: 'metric' }, 1000, 'ft'],
  ] as const)('keeps the independently owned feet with %o', (options, value, unit) => {
    expect(parseMeasurement("1000,' ′-11pound", options)).toMatchObject({
      value,
      unit,
      type: 'height',
      matches: [{ value: 1000, unit: 'ft' }],
    });
  });
});
