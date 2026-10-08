import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions } from '../src';

// Each input with the Unicode minus sign (U+2212) in place of each hyphen-minus before a digit.
const unicode = (raw: string): string => raw.replace(/-(?=[\d.])/g, '−');

// Inputs and results from AFA-80 and its comments.
describe('signed parts', () => {
  // A range that repeats its unit is two measurements that disagree (README). After a number and
  // its unit, a hyphen joins two parts or values and isn't a sign.
  it.each([
    '150 lbs-180 lbs',
    '70 kg-80 kg',
    '5 ft 11 in-6 ft 1 in',
    // With marks for the units (AFA-89).
    "5'-6'",
    '72"-74"',
    '5\'11"-6\'1"',
  ])('returns null for the range %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  // AFA-89: an inch mark is the unit too, so the hyphen after it joins two values, as in
  // "5 in-5 in" (5 in). The double prime, the right double quote and the full-width quote read as
  // an inch mark too (AFA-61). A space can come between the number and the mark, as in '5 "'.
  it.each(['5"-5 in', '5″-5 in', '5”-5 in', '5＂-5 in', '5 "-5 in'])('reads %s as 5 in', raw => {
    expect(parseMeasurement(raw)).toMatchObject({
      value: 5,
      unit: 'in',
      type: 'height',
      matches: [{ value: 5, unit: 'in' }],
    });
  });

  // A weight after a height with marks reads as it does after the same height in words, as in
  // "6 ft 1 in-185 lbs" (185 lb). The hyphen after the inch mark no longer signs the weight.
  it('reads the weight in 6\'1"-185 lbs', () => {
    expect(parseMeasurement('6\'1"-185 lbs', { type: 'weight' })).toMatchObject({
      value: 185,
      unit: 'lb',
    });
  });

  // The README's "1 m 80 cm" is one height: 100 + 80 = 180 cm.
  it('reads 1 m-80 cm as one height', () => {
    expect(parseMeasurement('1 m-80 cm')).toMatchObject({
      value: 180,
      unit: 'cm',
      matches: [
        { value: 1, unit: 'm' },
        { value: 80, unit: 'cm' },
      ],
    });
  });

  // A measurement can't be negative, and the rest of the input must not decide the result.
  const signed = [
    '150 lbs -180 lbs',
    '[-5 kg] 70 kg',
    '180 lbs, -2 kg',
    'Height: 180 cm (-2 cm)',
    'lost -5 lbs, now 180 lbs',
    // The README returns null for "12st 4lb".
    '-12st 4lb',
    '-12 st 4 lb',
    '-10 stone 4 pounds',
    'stone -12, 4 lb',
    '-1 m 80 cm',
    '-2 m 5 cm',
    '-70 kg (154 lbs)',
    '-1.8 m (5 ft 11 in)',
    '-5 ft 6 ft',
    'kg -5 (was 75 kg)',
    'delta -2 kg, weight 70 kg',
    // A word that isn't a number before the unit keeps it a prefix.
    'delta kg -2, weight 70 kg',
    // A signed value after a label, as the unsigned "age 28, kg: 5, 180 lbs" returns null.
    'age 28, kg: -5, 180 lbs',
    'record 0; kg -5, now 70 kg',
    // A signed value after a label is the label's value.
    'age 28 kg: -5',
    'age 28 (kg) -5',
    // A number and its unit can stand on two sides of a semicolon, as in "180;lbs" (README).
    '-5 kg, 180;lbs',
    'kg; 70, -5 kg',
    // A signed amount in an unsupported unit reads as its unsigned form, which returns null.
    '-12;st 4lb',
    '7 lb -8;oz',
    'kg 3, -400 g',
    '--12 st 4 lb',
    'stone --12, 4 lb',
    // A space before the sign makes it a sign, as in "5 ft -11 in".
    '1 m -80 cm',
    '5 ft -11 in',
    '5" -5 in',
  ];
  it.each(signed)('returns null for %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  // AFA-65 maps a Unicode minus sign to a hyphen-minus only when no number comes before it.
  it.each(signed.map(unicode).filter(raw => /^\D*−/.test(raw)))(
    'returns null for the Unicode form %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  // A signed height doesn't cancel a weight, as an existing test for -5'-11" shows.
  it('keeps a weight after a signed height', () => {
    expect(parseMeasurement('-5 ft, 150 lbs')).toMatchObject({ value: 150, unit: 'lb' });
  });

  // From the README unless marked.
  it.each([
    ['-5 feet', {}],
    ['kg-70.5', {}],
    ['150 lbs - 180 lbs', {}],
    ['150-180 lbs', {}],
    // AFA-89: a range with spaces around the hyphen.
    ['72" - 74"', {}],
    // Existing test: a signed fragment before a semicolon in one measurement.
    ['-5;feet 11 inches', {}],
  ] as const)('keeps returning null for %s with %o', (raw, options: ParseOptions) => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });

  it.each([
    ['5 ft-11', {}, 71, 'in'],
    ['5\'-11"', {}, 71, 'in'],
    ['5-foot-11', {}, 71, 'in'],
    ['record 0; kg 70', {}, 70, 'kg'],
    ['0 feet; actual 1.8 meters', {}, 1.8, 'm'],
    // A semicolon separates independent fields (existing test).
    ['invalid -5 ft; actual 180 cm', {}, 180, 'cm'],
    // A signed number without a unit next to it isn't a part (AFA-80).
    ['temp -5, weight 70 kg', {}, 70, 'kg'],
    // A short alias before a number is usually another word.
    ['in -5 degrees, 70 kg', {}, 70, 'kg'],
    // A label reads the number after it, not the field before it (README: "age=28, kg=72").
    ['temp=-5, kg=72', {}, 72, 'kg'],
    ['Change: -2, kg: 70', {}, 70, 'kg'],
    ['score -2, in: 72', {}, 72, 'in'],
    ['Delta: -2; lbs: 180', {}, 180, 'lb'],
    ['-3 kg=70', {}, 70, 'kg'],
    ['offset -3 (kg) 70', {}, 70, 'kg'],
    // "St" and "g" before a number are usually other words (README: "Main St 12").
    ['Main St -12, 180 lbs', {}, 180, 'lb'],
    ['g -2, 70 kg', {}, 70, 'kg'],
    // A minus sign before a word doesn't make the word a number, as in "x st 4 lb".
    ['-x st 4 lb', {}, 4, 'lb'],
    ['-approx kg, 70 kg', {}, 70, 'kg'],
    // "1st" is an ordinal, with a minus sign too (README: "Oct 1st").
    ['-1st 70 kg', {}, 70, 'kg'],
    // An unrelated amount in an unsupported unit doesn't count, signed or not (README: "8 oz").
    ['-8 oz of water, 70 kg', {}, 70, 'kg'],
    // "and" joins number words, so 5 is the feet's number.
    ['5 and ft -11', {}, 5, 'ft'],
  ] as const)('keeps reading %s with %o as %s %s', (raw, options: ParseOptions, value, unit) => {
    expect(parseMeasurement(raw, options)).toMatchObject({ value, unit });
  });

  // A signed weight doesn't cancel a height either.
  it('keeps a height after a signed weight', () => {
    expect(parseMeasurement('-12 st, 6 ft')).toMatchObject({ value: 6, unit: 'ft' });
  });

  // A semicolon can stand inside one measurement, as in "180;lbs" (README), so "-5;ft" is a signed
  // part, and the fields on both sides of it go.
  it('returns null for a signed part across a semicolon', () => {
    expect(parseMeasurement('6 ft -5;ft')).toBeNull();
  });

  // Only a leading minus sign makes a signed number. "x--5" isn't a number at all.
  it('reads 70 kg after a token with a minus sign inside it', () => {
    expect(parseMeasurement('x--5 kg, 70 kg')).toMatchObject({ value: 70, unit: 'kg' });
  });

  // Round 1 (Codex). A signed value with its own unit isn't the label's value, a semicolon can
  // stand between a number and its unit, and implied inches belong to their own field.
  it.each([
    ['180 cm = -82 kg', 180, 'cm'],
    ['72 in: -180 lbs', 72, 'in'],
    ['1;m-80 cm', 180, 'cm'],
    ['1;;m-80 cm', 180, 'cm'],
    ['180;lbs-180 lbs', 180, 'lb'],
    ['5 ft 11; -2 cm', 71, 'in'],
  ] as const)('reads %s as %s %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit });
  });

  // Each signed label value is read without its sign in place, not in a copy of the tokens. A copy
  // made 20,000 signed labels take 3.5 s. The limit compares them with the same labels without
  // signs, because a slow run, such as Stryker's instrumented one, slows both.
  it('reads many signed label values about as fast as unsigned ones', () => {
    let start = performance.now();
    parseMeasurement('kg: 5 '.repeat(20_000));
    const unsigned = performance.now() - start;
    start = performance.now();
    expect(parseMeasurement('kg: -5 '.repeat(20_000))).toBeNull();
    expect(performance.now() - start).toBeLessThan(3 * unsigned + 100);
  });

  // "5 ft -11" has no inch unit, so -11 isn't a part (existing test).
  it('keeps 5 ft from 5 ft -11', () => {
    expect(parseMeasurement('5 ft -11')?.matches).toEqual([{ value: 5, unit: 'ft' }]);
  });
});
