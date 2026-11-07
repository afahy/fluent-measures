import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

// AFA-247 final review: a semicolon separates independent fields, but may also sit
// between a complete number and its unit. Values come from those fields and decimal arithmetic.
describe('semicolon boundaries after spoken decimals', () => {
  it.each([
    ['age twenty point five; 80 kg', 80, 'kg'],
    ['age twenty point five; 1.8 m', 1.8, 'm'],
    ['age twenty point 5; 80 kg', 80, 'kg'],
    ['age twenty point five;80 kg', 80, 'kg'],
    ['age twenty point five; eighty kg', 80, 'kg'],
    ['age twenty point five; point five kg', 0.5, 'kg'],
    ['age twenty point five; .5 kg', 0.5, 'kg'],
    ['age twenty point five; 80;kg', 80, 'kg'],
    ['age twenty point five; kg=80', 80, 'kg'],
    ['age twenty point five; kg: 80', 80, 'kg'],
    ['age twenty point five; 70 kg (154 lbs)', 70, 'kg'],
    ['kg seventy point five; 70.5 kg', 70.5, 'kg'],
    ['80;kg', 80, 'kg'],
    ['70.5;kg', 70.5, 'kg'],
    ['seventy point five;kg', 70.5, 'kg'],
    ['seventy point five; kg', 70.5, 'kg'],
    ['kg seventy point five;', 70.5, 'kg'],
    ['5 ft eleven point five;in', 71.5, 'in'],
  ] as const)('preserves the independent measurement in %s', (input, value, unit) => {
    expect(parseMeasurement(input)).toMatchObject({ value, unit });
  });

  it.each([
    'age twenty point five; -80 kg',
    'age twenty point five; −80 kg',
    'age twenty point five; -point five kg',
    'kg seventy point five; 72 kg',
  ])('rejects signed or disagreeing measurements in %s', input => {
    expect(parseMeasurement(input)).toBeNull();
  });
});
