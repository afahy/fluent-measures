import { cpuUsage } from 'node:process';
import { describe, expect, it } from 'vitest';
import { tokenize, type Token } from '../src/tokenize';
import { underStryker } from './timing';

// The text of each token.
const tokenTexts = (input: string): string[] => tokenize(input).map(({ text }) => text);

// Tokenizes raw, and checks that it takes less than limit milliseconds of CPU time.
const tokenizeWithin = (raw: string, limit: number): Token[] => {
  const start = cpuUsage();
  const tokens = tokenize(raw);
  const { user, system } = cpuUsage(start);
  expect((user + system) / 1000).toBeLessThan(limit);
  return tokens;
};

// These cases come from the tests of normalizeForms and normalizeFractions, which AFA-88 removes.
// Each input gives the tokens that main's tokenize gave for the text that the old test expected.
// The tokens were taken from main's code once, not from the code under test.
describe('tokenize reads the forms that normalizeForms read', () => {
  it.each([
    ['5’11”', ['5', "'", '11', '"']],
    ['5′11″', ['5', "'", '11', '"']],
    ['5´11´´', ['5', "'", '11', '"']],
    ['１８０ｃｍ', ['180', 'cm']],
    ['180 ㎝', ['180', 'cm']],
    ['70 ㎏', ['70', 'kg']],
    // A quotation closes before the height, so the marks after it are feet and inches.
    ['‘tall’ 5’11”', ['tall', '5', "'", '11', '"']],
    // Every mark in the input converts, not only the first.
    ['5’11’’', ['5', "'", '11', '"']],
    ['72” or 70”', ['72', '"', 'or', '70', '"']],
    // A minus sign before the first number becomes a hyphen-minus, in each place before it.
    ['−5 ft', ['-5', 'ft']],
    ['﹣5 ft', ['-5', 'ft']],
    ['－5 ft', ['-5', 'ft']],
    ['−½ lb', ['-0.5', 'lb']],
    ['−.5 kg', ['-.5', 'kg']],
    ['−,5 kg', ['-.5', 'kg']],
    ['kg −−5', ['kg', '-5']],
    ['kg−70.5 or −2', ['kg', '-70.5', 'or', '2']],
    // A word that only contains a number word isn't a number.
    ['often −5 ft', ['often', '-5', 'ft']],
    ['Someone −5 ft', ['someone', '-5', 'ft']],
  ])('reads %s', (input, expected) => {
    expect(tokenTexts(input)).toEqual(expected);
  });

  // A fraction stays a number, and plain text doesn't change. A minus sign after a number, or one
  // that no number follows, separates tokens.
  it.each([
    ['5½ ft', ['5.5', 'ft']],
    ['150 lbs', ['150', 'lbs']],
    ['5\'11"', ['5', "'", '11', '"']],
    ['‘180 lbs’', ['180', 'lbs']],
    ['“180 lbs”', ['180', 'lbs']],
    ['she’s', ['she', 's']],
    ['the 70s’ fashion', ['the', '70', 's', 'fashion']],
    ['5−11', ['5', '11']],
    ['1.5−2 m', ['1.5', '2', 'm']],
    ['Height − 180 cm', ['height', '180', 'cm']],
    ['180− lbs', ['180', 'lbs']],
    ['150 lbs−180 lbs', ['150', 'lbs', '180', 'lbs']],
    ['1 m −80 cm', ['1', 'm', '80', 'cm']],
    ['5 ft ﹣11 in', ['5', 'ft', '11', 'in']],
    // A number word or a Unicode fraction is an earlier number too.
    ['one m−80 cm', ['one', 'm', '80', 'cm']],
    ['Five ft﹣11 in', ['five', 'ft', '11', 'in']],
    ['½ lb−180 lbs', ['0.5', 'lb', '180', 'lbs']],
    ['one hundred−5', ['one', 'hundred', '5']],
  ])('keeps the marks and minus signs of %s', (input, expected) => {
    expect(tokenTexts(input)).toEqual(expected);
  });

  // A mark must not make the code search back through the whole input. A search like that took
  // about 460 ms for this input. The test skips itself under Stryker (AFA-95).
  it.skipIf(underStryker)('reads a long run of marks quickly', () => {
    expect(tokenizeWithin('1’'.repeat(100_000), 400)).toHaveLength(200_000);
  });

  // The check for an earlier number stops at the first one, so it stays fast for many signs.
  it('reads a minus sign after a long word as a separator', () => {
    expect(tokenTexts(`${'a'.repeat(100_000)}−5`)).toEqual(['a'.repeat(100_000), '5']);
  });

  it.skipIf(underStryker).each(['−1 '.repeat(50_000), '−a'.repeat(100_000)])(
    'reads many minus signs quickly',
    raw => {
      expect(tokenizeWithin(raw, 400).length).toBeGreaterThan(0);
    }
  );
});

describe('tokenize reads the fractions that normalizeFractions read', () => {
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
    ['-½', ['-0.5']],
    ['1000000000000000000000½', ['x']],
    // The whole number counts only when spaces separate it from the fraction.
    ['ward 7 1/2', ['ward', '7.5']],
    // Each Unicode fraction is read, not only the first.
    ['½ and ¼', ['0.5', 'and', '0.25']],
    // The old test read this without the comma step, as "7,0.5". With it, as main's tokenize
    // reads it, "7,1" is 7.1 and "7.1/2" has a decimal in it, so it's "x" (a hand calculation).
    ['7,1/2', ['x']],
  ])('reads %s', (input, expected) => {
    expect(tokenTexts(input)).toEqual(expected);
  });

  it.each([
    // Two slashes make a date or a code, not a fraction.
    ['12/25/2020', ['12', '25', '2020']],
    ['5/11/', ['5', '11']],
    ['/5/11', ['5', '11']],
    // A slash after a number that follows a letter or quote mark separates two measurements.
    ["5'10/180", ['5', "'", '10', '180']],
    ['5ft10/180lbs', ['5', 'ft10', '180', 'lbs']],
    ['5 ft 10/180 lbs', ['5', 'ft', '10', '180', 'lbs']],
    ['blood pressure 120/80', ['blood', 'pressure', '120', '80']],
    // No slash, no fraction.
    ['150 lbs', ['150', 'lbs']],
  ])('keeps the slashes of %s as separators', (input, expected) => {
    expect(tokenTexts(input)).toEqual(expected);
  });
});
