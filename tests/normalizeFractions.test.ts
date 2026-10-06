import { describe, expect, it } from 'vitest';
import { normalizeFractions } from '../src/tokenize';

describe('normalizeFractions', () => {
  it.each([
    ['150 1/2 lbs', '150.5 lbs'],
    ['1/2 lbs', '0.5 lbs'],
    ['3 3/4', '3.75'],
    ['68 11/16 in', '68.6875 in'],
    ['5/2 lbs', 'x lbs'],
    ['150 5/2 lbs', 'x lbs'],
    ['1.25/2', 'x'],
    ['1/2.25', 'x'],
    ['5.25 1/2', 'x'],
    ['.5 1/2', 'x'],
    ['.5/2', 'x'],
    ["5'7 1/2", "5'7.5"],
    ['5½', '5.5'],
    ['¾ kg', '0.75 kg'],
    ['⅛', '0.125'],
    ['⅞', '0.875'],
    ['5↉', '5'],
  ])('writes %s as %s', (input, output) => {
    expect(normalizeFractions(input).trim()).toBe(output);
  });

  it.each([
    // Two slashes make a date or a code, not a fraction.
    '12/25/2020',
    '5/11/',
    '/5/11',
    // A slash after a number that follows a letter or quote mark separates two measurements.
    "5'10/180",
    '5ft10/180lbs',
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
