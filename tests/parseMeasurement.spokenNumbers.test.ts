import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

// Inputs and results from AFA-60, which come from the AFA-41 corpus.
describe('spoken numbers', () => {
  it.each([
    ['one-eighty pounds', {}, 180, 'lb'],
    ['one sixty lbs', {}, 160, 'lb'],
    ['two twenty-five lbs', {}, 225, 'lb'],
    ['five-eleven', { type: 'height' }, 71, 'in'],
    ['six-two', { type: 'height' }, 74, 'in'],
  ] as const)('reads %s with %o as %s %s', (raw, options, value, unit) => {
    expect(parseMeasurement(raw, options)).toMatchObject({ value, unit });
  });

  it.each([
    ['one hundred fifty pounds', {}, 150, 'lb'],
    ['seventy-two inches', {}, 72, 'in'],
    ['five foot ten', { type: 'height' }, 70, 'in'],
    ['twenty one kg', {}, 21, 'kg'],
  ] as const)('keeps reading %s with %o as %s %s', (raw, options, value, unit) => {
    expect(parseMeasurement(raw, options)).toMatchObject({ value, unit });
  });

  // Like "5-11", a spoken height needs { type: 'height' } and inches below 12. The feet must be
  // 3 to 8, so "twenty-one" and "two-ten" aren't heights.
  it.each([
    ['five-eleven', {}],
    ['5-11', {}],
    ['five-twelve', { type: 'height' }],
    ['twenty-one', { type: 'height' }],
    ['two-ten', { type: 'height' }],
    ['five-eleven-two', { type: 'height' }],
  ] as const)('returns null for %s with %o', (raw, options) => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });
});
