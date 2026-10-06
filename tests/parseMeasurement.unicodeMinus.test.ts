import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

// Inputs and results from AFA-65, which come from the AFA-41 corpus, and the ticket's comment.
describe('Unicode minus signs', () => {
  // A measurement can't be negative, so each of these returns null, as "-5 ft" does.
  it.each(['−5 ft', '﹣5 ft', '－5 ft', '−½ lb', '−.5 kg', 'kg−70.5', '−5 ft 11 in'])(
    'returns null for %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  it('reads a negative inch part as "5 ft -11 in" does', () => {
    expect(parseMeasurement('5 ft −11 in')).toMatchObject({ value: 5, unit: 'ft' });
  });

  // A minus sign after a digit, or one with a space after it, is a dash. The README reads a
  // Unicode dash between two numbers as a range, as in "150 – 180 lbs".
  it.each([
    ['5 ft−11', {}, 71, 'in'],
    ['Height − 180 cm', {}, 180, 'cm'],
    ['temp −5, weight 70 kg', {}, 70, 'kg'],
  ] as const)('keeps reading %s with %o as %s %s', (raw, options, value, unit) => {
    expect(parseMeasurement(raw, options)).toMatchObject({ value, unit });
  });

  it.each([
    ['150 − 180 lbs', {}],
    ['150−180 lbs', {}],
    ['5−11', { type: 'height' }],
  ] as const)('keeps returning null for the range %s with %o', (raw, options) => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });
});
