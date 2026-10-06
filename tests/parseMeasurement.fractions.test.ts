import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

// Inputs and results from AFA-59, which come from the AFA-41 corpus.
describe('fractions', () => {
  it.each([
    ['150 1/2 lbs', 150.5, 'lb'],
    ['5 1/2 feet', 5.5, 'ft'],
    ['72 1/2 inches', 72.5, 'in'],
    ['5 feet 3 1/2 inches', 63.5, 'in'],
    ['5 feet 8 3/4 inches', 68.75, 'in'],
    ['5½ ft', 5.5, 'ft'],
    ['5 ½ feet', 5.5, 'ft'],
    ['5\' 7½"', 67.5, 'in'],
    ['72½ kg', 72.5, 'kg'],
    ['154¼ lbs', 154.25, 'lb'],
    ['5ft 10½in', 70.5, 'in'],
  ] as const)('reads %s as %s %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit });
  });

  it.each([
    ['1,000 1/2 lbs', 1000.5, 'lb'],
    ['68 11/16 in', 68.6875, 'in'],
  ] as const)('reads the whole number and fraction in %s as %s %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit });
  });

  it.each(['5/2 lbs', '3/0 lbs', '1/1 lbs', '150 5/2 lbs', 'feet 150 5/2'])(
    'returns null for a slash that is not a proper fraction in %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  // These have no plain decimal value: a decimal in the fraction or before it, and results that
  // String() writes with an exponent (5e-7 and 1e+21).
  it.each([
    '5.25 1/2 ft',
    'feet 5.25 1/2',
    '1.25/2 lbs',
    '1/2.25 lbs',
    '1/2000000 lbs',
    '1000000000000000000000 1/2 lbs',
  ])('returns null for %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it.each(['180/120', '1/2 cup of flour', 'blood pressure 120/80'])('returns null for %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it.each([
    ['blood pressure 120/80, weight 180 lbs', 180, 'lb'],
    ['12/25/2020, 180 lbs', 180, 'lb'],
    ['1,234,56 kg', 1234.56, 'kg'],
  ] as const)('keeps reading %s as %s %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit });
  });

  it('keeps the README shorthand and range rules', () => {
    expect(parseMeasurement('5-11', { type: 'height' })).toMatchObject({ value: 71, unit: 'in' });
    expect(parseMeasurement('150-180 lbs')).toBeNull();
  });
});
