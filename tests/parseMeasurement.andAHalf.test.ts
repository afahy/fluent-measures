import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

// AFA-63: "and a half" after a whole number adds 0.5, for digits and number words.
describe('and a half', () => {
  it.each([
    // The inputs from AFA-63. After a feet part with no inch unit, the half belongs to the inches:
    // 5 × 12 + 10.5 = 70.5.
    ['5 foot 10 and a half', 70.5, 'in'],
    ['1 and a half meters', 1.5, 'm'],
    ['six and a half feet', 6.5, 'ft'],
    // With an inch unit after the half, and with number words: 5 × 12 + 11.5 = 71.5.
    ['5 foot 10 and a half inches', 70.5, 'in'],
    ['five foot eleven and a half', 71.5, 'in'],
    ['seventy and a half kg', 70.5, 'kg'],
  ] as const)('reads %s as %s %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit });
  });

  // "Must not change" in AFA-63, from the README and the corpus.
  it.each([
    ['one hundred and 50 pounds', 150, 'lb'],
    ['5 foot 10 inches', 70, 'in'],
    ['a hundred and sixty pounds', 160, 'lb'],
    // "a half-hour" with no number before "and" doesn't add to the feet.
    ['5 ft and a half-hour walk', 5, 'ft'],
  ] as const)('keeps reading %s as %s %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit });
  });

  // Only a whole number takes "and a half", and "a half" needs a number before it.
  it.each(['1.5 and a half m', 'a half inch', 'and a half feet'])('returns null for %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });
});
