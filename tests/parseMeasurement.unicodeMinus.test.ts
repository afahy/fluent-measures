import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

// Inputs and results from AFA-65, which come from the AFA-41 corpus, and the ticket's comment.
describe('Unicode minus signs', () => {
  // A measurement can't be negative, so each of these returns null, as "-5 ft" does. The README
  // gives "kg-70.5" → null for a minus sign after a unit prefix.
  it.each([
    ['−5 ft', {}],
    ['﹣5 ft', {}],
    ['－5 ft', {}],
    ['−½ lb', {}],
    ['−.5 kg', {}],
    ['−,5 kg', {}],
    ['kg−70.5', {}],
    ['Weight: −70 kg', {}],
    ['−5 ft 11 in', {}],
    ['−180', { type: 'height', allowUnqualified: true }],
  ] as const)('returns null for %s with %o', (raw, options) => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });

  // After a number, a minus sign joins two parts or values. The README reads a dash between two
  // numbers as a range, and returns null for a range that repeats its unit.
  it.each([
    ['150 lbs−180 lbs', {}],
    ['150 lbs −180 lbs', {}],
    ['70 kg﹣80 kg', {}],
    ['150 − 180 lbs', {}],
    ['150−180 lbs', {}],
    ['5−11', { type: 'height' }],
    ['Height: 180 cm (−2 cm)', {}],
  ] as const)('keeps returning null for %s with %o', (raw, options) => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });

  // 5 ft and 11 in are one height: 5 × 12 + 11 = 71 in.
  it.each([
    ['5 ft −11 in', {}, 71, 'in'],
    ['5 ft−11', {}, 71, 'in'],
    ['Height − 180 cm', {}, 180, 'cm'],
    ['180 cm−70 kg', { type: 'weight' }, 70, 'kg'],
  ] as const)('keeps reading %s with %o as %s %s', (raw, options, value, unit) => {
    expect(parseMeasurement(raw, options)).toMatchObject({ value, unit });
  });

  // The README's "1 m 80 cm" is one height with two parts.
  it('keeps the parts of 1 m−80 cm', () => {
    expect(parseMeasurement('1 m−80 cm')?.matches).toEqual([
      { value: 1, unit: 'm' },
      { value: 80, unit: 'cm' },
    ]);
  });
});
