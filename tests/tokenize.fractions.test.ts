import { describe, expect, it } from 'vitest';
import { tokenize } from '../src/tokenize';

const tokenTexts = (input: string): string[] => tokenize(input).map(({ text }) => text);

// AFA-88: these cases moved from tests/normalizeFractions.test.ts. Its function,
// normalizeFractions, was one of the passes that the single scan replaced. Each input must give
// the tokens of the text that the old test expected, as main's tokenizer at f85a98d splits that
// text. Two inputs differ, because the old test ran the fraction pass alone, and main's tokenize at
// f85a98d gives the tokens below. In "7,1/2", the comma is a decimal comma first, as in "72,5", so
// the fraction "7.1/2" has a decimal and is "x", as "1.25/2" is. In "5ft10/180lbs", a unit before
// digits ends its word (AFA-62), and the slash after "10" then separates two measurements.
describe('tokenize: fractions', () => {
  it.each([
    ['150 1/2 lbs', ['150.5', 'lbs']],
    ['1/2 lbs', ['0.5', 'lbs']],
    ['3 3/4', ['3.75']],
    ['68 11/16 in', ['68.6875', 'in']],
    ['5/2 lbs', ['x', 'lbs']],
    ['150 5/2 lbs', ['x', 'lbs']],
    ['1.25/2', ['x']],
    ['1/2.25', ['x']],
    ['5.25 1/2', ['x']],
    ['.5 1/2', ['x']],
    ['.5/2', ['x']],
    ["5'7 1/2", ['5', "'", '7.5']],
    ['5½', ['5.5']],
    ['¾ kg', ['0.75', 'kg']],
    ['⅛', ['0.125']],
    ['⅞', ['0.875']],
    ['5↉', ['5']],
    ['-½', ['-', '0.5']],
    ['1000000000000000000000½', ['x']],
    ['ward 7 1/2', ['ward', '7.5']],
    ['½ and ¼', ['0.5', 'and', '0.25']],
    ['7,1/2', ['x']],
  ])('reads %s as the tokens of the converted text', (input, expected) => {
    expect(tokenTexts(input)).toEqual(expected);
  });

  it.each([
    // Two slashes make a date or a code, not a fraction.
    ['12/25/2020', ['12', '/', '25', '/', '2020']],
    ['5/11/', ['5', '/', '11', '/']],
    ['/5/11', ['/', '5', '/', '11']],
    // A slash after a number that follows a letter or quote mark separates two measurements.
    ["5'10/180", ['5', "'", '10', '/', '180']],
    ['5ft10/180lbs', ['5', 'ft', '10', '/', '180', 'lbs']],
    ['5 ft 10/180 lbs', ['5', 'ft', '10', '/', '180', 'lbs']],
    ['blood pressure 120/80', ['blood', 'pressure', '120', '/', '80']],
    // No slash, no fraction.
    ['150 lbs', ['150', 'lbs']],
  ])('reads %s with its fractions unchanged', (input, expected) => {
    expect(tokenTexts(input)).toEqual(expected);
  });
});
