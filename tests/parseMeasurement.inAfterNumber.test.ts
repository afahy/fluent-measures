import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

// AFA-130: after a number, "in" means inches, also in ordinary text (README, AFA-67). These pin
// what such inches do next to another measurement. Each reason is a README rule.
describe('"N in" in ordinary text next to another measurement', () => {
  it.each([
    // Separate Measurements: feet then inches, which are the next smaller unit, form one height.
    // 6 × 12 + 3 = 75.
    ['6 ft and ranked 3 in the state', {}, 75, 'in'],
    // A comma doesn't separate parts (Weight): 6 × 12 + 10 = 82.
    ['6 ft, top 10 in the class', {}, 82, 'in'],
    // `in` right after a number means inches, before a hyphen too.
    ['Top 10 in-house', {}, 10, 'in'],
    // The type picks the measurement. Without one, the corpus accepts either result or null.
    ['180 lbs, top 10 in the class', { type: 'weight' }, 180, 'lb'],
    ['180 lbs, top 10 in the class', { type: 'height' }, 10, 'in'],
  ] as const)('reads %s with %j as %s %s', (raw, options, value, unit) => {
    expect(parseMeasurement(raw, options)).toMatchObject({ value, unit });
  });

  it.each([
    // Inches before feet aren't parts of one height, so 3 in and 6 ft (72 in) disagree.
    'ranked 3 in the state and 6 ft',
    // `in.` is a label, which reads the number after it, and no number follows.
    'Top 10 in.the class',
  ])('returns null for %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });
});
