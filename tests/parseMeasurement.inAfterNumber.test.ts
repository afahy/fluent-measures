import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

// AFA-130: after a number, "in" means inches, also in ordinary text (README, AFA-67). These pin
// what such inches do next to another measurement. Each reason is a README rule or option.
describe('"N in" in ordinary text next to another measurement', () => {
  it.each([
    // Separate Measurements: feet then inches, which are the next smaller unit, form one height.
    // 6 × 12 + 3 = 75.
    ['6 ft and ranked 3 in the state', 75, 6, 3],
    // A comma doesn't separate parts (Weight): 6 × 12 + 10 = 82.
    ['6 ft, top 10 in the class', 82, 6, 10],
  ] as const)('joins the feet and the inches in %s: %s in', (raw, value, feet, inches) => {
    expect(parseMeasurement(raw)).toMatchObject({
      value,
      unit: 'in',
      matches: [
        { value: feet, unit: 'ft' },
        { value: inches, unit: 'in' },
      ],
    });
  });

  // The `type` option reads only that measurement (ParseOptions). Without a type, the corpus
  // accepts the height, the weight or null for text with both (multiple-height-weight-no-type),
  // so this test doesn't pin that case.
  it.each([
    [{ type: 'weight' }, 180, 'lb'],
    [{ type: 'height' }, 10, 'in'],
  ] as const)('reads 180 lbs, top 10 in the class with %j as %s %s', (options, value, unit) => {
    expect(parseMeasurement('180 lbs, top 10 in the class', options)).toMatchObject({
      value,
      unit,
    });
  });

  // Weight: a capital G right after a number is a network generation, so "5G" isn't a number
  // and "in" after it isn't inches. Only 6 ft is read, unlike "ranked 3 in the state and 6 ft".
  it('reads 5G in the house, 6 ft as 6 ft', () => {
    expect(parseMeasurement('5G in the house, 6 ft')).toMatchObject({
      value: 6,
      unit: 'ft',
      matches: [{ value: 6, unit: 'ft' }],
    });
  });

  it.each([
    // Separate Measurements: inches before feet aren't parts of one height, so 3 in and 6 ft
    // (72 in) are two measurements that disagree.
    'ranked 3 in the state and 6 ft',
    // "in.the" is one word, not "in" after a number, so 10 has no unit. The label "in." needs a
    // space or the end of the text after it, as in `Top 10 in. the class` (10 in).
    'Top 10 in.the class',
  ])('returns null for %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });
});
