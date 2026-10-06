import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';
import { normalizeFractions } from '../src/tokenize';

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

  it.each(['5/2 lbs', '3/0 lbs', '150 5/2 lbs'])(
    'returns null for a slash that is not a proper fraction in %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

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

describe('normalizeFractions', () => {
  // A Unicode fraction gets a space before it, so it can follow a whole number.
  it.each([
    ['150 1/2 lbs', '150.5 lbs'],
    ['1/2 lbs', '0.5 lbs'],
    ['3 3/4', '3.75'],
    ['5½', '5.5'],
    ['¾ kg', ' 0.75 kg'],
    ['⅛', ' 0.125'],
    ['⅞', ' 0.875'],
    ['5/2 lbs', 'x lbs'],
    ['1/1', 'x'],
    ['3/0', 'x'],
  ])('writes %s as %s', (input, output) => {
    expect(normalizeFractions(input)).toBe(output);
  });

  it.each([
    // Two slashes make a date or a code, not a fraction.
    '12/25/2020',
    '5/11/',
    '/5/11',
    // A fraction can't continue a decimal number.
    '1.1/2',
    // No slash, no fraction.
    '150 lbs',
  ])('leaves %s as it is', input => {
    expect(normalizeFractions(input)).toBe(input);
  });

  it('reads the whole number only when spaces separate it from the fraction', () => {
    expect(normalizeFractions('ward 7 1/2')).toBe('ward 7.5');
    expect(normalizeFractions('7,1/2')).toBe('7,0.5');
  });
});
