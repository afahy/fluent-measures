// AFA-250: recovery expectations now follow the approved complete-entry contract in PARSING.md.
// Earlier ticket rationales below describe their historical extraction contract; original
// assertions are retained separately under design/afa-250.
import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions } from '../src';

const weightOptions: ParseOptions[] = [{}, { type: 'weight' }, { normalizedUnit: 'kg' }];

describe.each(weightOptions)('signed other-type ownership with %o', options => {
  // AFA-116: the signed feet value owns its unit; neither kg prefix owns that value.
  it.each(['kg -6 ft, 70 kg', 'kilograms -6 ft, 70 kg'])(
    'rejects the complete entry %s (AFA-250)',
    raw => {
      expect(parseMeasurement(raw, options)).toBeNull();
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
  ])('rejects the complete entry %s (AFA-250)', raw => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });
});

describe('signed other-type ownership controls', () => {
  // Retaining the independently owned field must also retain disagreements with earlier
  // measurements (PARSING.md, More Than One Measurement): 70 vs 80 kg and 180 vs 190 cm
  // differ by more than 1%. The old ownership bug incorrectly discarded the later value.
  it.each([
    ['70 kg; kg -6 ft, 80 kg', {}],
    ['70 kg; kg -6 ft, 80 kg', { type: 'weight' }],
    ['180 cm; centimeters -180 lbs, 190 cm', {}],
    ['180 cm; centimeters -180 lbs, 190 cm', { type: 'height' }],
  ] as const)('retains the disagreement in %s with %o', (raw, options) => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });

  // Ticket preservation cases, including unsigned behavior explicitly excluded from this fix.
  it.each([
    'kg 6 ft, 70 kg',
    'kilograms 6 ft, 70 kg',
    '-5 ft, 150 lbs',
    'kg: -6 ft, 70 kg',
    'in: -180 lbs, 72 in',
    'centimeters -180 lbs, 180 cm',
    'feet -70 kg, 6 ft',
    'in -5 degrees, 70 kg',
    'record 0; kg 70',
    'kg -5; actual 70 kg',
    '70 kg, kg; -5 lb; actual 80 kg',
  ])('rejects the complete entry %s (AFA-250)', raw => {
    expect(parseMeasurement(raw)).toBeNull();
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

  it('rejects signed fragments even with fuzzy units', () => {
    expect(parseMeasurement('kg -6 foots, 70 kg', { fuzziness: 1 })).toBeNull();
  });

  it('rejects an owned signed value without a following unit with fuzziness enabled', () => {
    expect(parseMeasurement('pound-0.75', { fuzziness: 2 })).toBeNull();
  });

  it('rejects signed other-type fragments before conversion', () => {
    expect(parseMeasurement('kg -6 ft, 150 lbs', { normalizedUnit: 'kg' })).toBeNull();
  });

  // The generated result inventory reaches the same ownership boundary through a prime.
  // The first mark owns 1000 ft; the next cannot own the signed pounds. 1000 * 30.48 = 30480.
  it.each([
    [{}, 1000, 'ft'],
    [{ type: 'height' }, 1000, 'ft'],
    [{ normalizedUnit: 'cm' }, 30480, 'cm'],
    [{ fuzziness: 2 }, 1000, 'ft'],
    [{ type: 'height', allowUnqualified: true, inferUnit: 'metric' }, 1000, 'ft'],
  ] as const)('rejects the signed fragment with %o', (options, _value, _unit) => {
    expect(parseMeasurement("1000,' ′-11pound", options)).toBeNull();
  });
});
