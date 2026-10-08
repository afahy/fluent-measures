import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions } from '../src';
import { parseWithin, underStryker } from './timing';

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

  // Each signed label value is read without its sign in place, not in a copy of the tokens. Here,
  // with 20,000 signed labels, a copy took 10.7 s, and the current code takes 70 ms, or 160 ms with
  // coverage. In CI's coverage run it took up to 630 ms, so the 4 s limit of CPU time leaves about 6
  // times that (AFA-95). The test skips itself under Stryker.
  it.skipIf(underStryker)('reads many signed label values quickly', () => {
    expect(parseWithin('kg: -5 '.repeat(20_000), 4000)).toBeNull();
  });

  // "5 ft -11" has no inch unit, so -11 isn't a part (existing test).
  it('keeps 5 ft from 5 ft -11', () => {
    expect(parseMeasurement('5 ft -11')?.matches).toEqual([{ value: 5, unit: 'ft' }]);
  });

  // AFA-90 item 1: a signed part drops only parts of its own type, as "-5 ft, 150 lbs" (150 lb)
  // shows. So a signed value with its own unit of the other type keeps the label's field.
  it.each([
    ['Height (in): -82 kg, 72 in', {}, 72, 'in'],
    ['Height (in): -82 kg, 72 in', { type: 'height' }, 72, 'in'],
    ['in: -180 lbs, 72 in', {}, 72, 'in'],
    ['Weigh in: -180 lbs, 72 in', {}, 72, 'in'],
    ['cm: -5 lbs, 180 cm', {}, 180, 'cm'],
    ['kg: -6 ft, 70 kg', {}, 70, 'kg'],
    ['kg: -6 ft, 70 kg', { type: 'weight' }, 70, 'kg'],
  ] as const)('reads %s with %o as %s %s', (raw, options: ParseOptions, value, unit) => {
    expect(parseMeasurement(raw, options)).toMatchObject({ value, unit });
  });

  // AFA-90 item 2: a semicolon before the number doesn't stop the join, so each gives the result
  // of the same input with a space for the hyphen, as "1 m-80 cm" (180 cm) does.
  it.each([
    ['70 kg;5 ft-11 in', {}, 71, 'in'],
    ['70 kg;5 ft-11 in', { type: 'height' }, 71, 'in'],
    ['1 ; m-80 cm', {}, 180, 'cm'],
    [';1 m-80 cm', {}, 180, 'cm'],
    ['180 ; lbs-180 lbs', {}, 180, 'lb'],
  ] as const)('reads %s with %o as %s %s', (raw, options: ParseOptions, value, unit) => {
    expect(parseMeasurement(raw, options)).toMatchObject({ value, unit });
  });

  // 70 kg and 180 lb disagree, so the input has no single weight.
  it('returns null for 70 kg;180 lbs-180 lbs', () => {
    expect(parseMeasurement('70 kg;180 lbs-180 lbs')).toBeNull();
  });

  // AFA-90 item 3: a label's value keeps its words without the sign, so it reads as the same value
  // in digits does: "180 cm = -82 kg" is 180 cm, and "age 28 kg: -5" is null.
  it.each([
    ['180 cm = -twenty five kg', {}, 180, 'cm'],
    ['180 cm = -twenty five kg', { type: 'height' }, 180, 'cm'],
    ['72 in: -one eighty lbs', {}, 72, 'in'],
  ] as const)('reads %s with %o as %s %s', (raw, options: ParseOptions, value, unit) => {
    expect(parseMeasurement(raw, options)).toMatchObject({ value, unit });
  });

  // AFA-90 items 3 and 5: a sign on the first word of a phrase in words signs the whole phrase,
  // as "-5 feet" returns null (README). A number too large for digits reads as "age 28 kg: -5"
  // does.
  it.each([
    'age 28 kg: -1000000000000000000000',
    '-twenty five kg',
    '-forty-five kg',
    '-one hundred eighty lbs',
    // As "stone 25, 4 lb" returns null.
    'stone -twenty five, 4 lb',
    // Two signs are a sign too, as "--12 st 4 lb" is.
    'age 28 kg: --5',
    // A quote before a unit doesn't make a number, so the sign stays, as in "kg-70.5" (README).
    '"kg-70"',
  ])('returns null for %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });
});

// AFA-114: "a" and "an" start a phrase in words, as in "a hundred kg" (100 kg), so a sign on them
// signs the phrase. A sign on the first word of a phrase also signs it before an ounce, gram or
// stone unit.
describe('a sign on the first word of a phrase', () => {
  it.each([
    // As "-one hundred kg" returns null.
    '-a hundred kg',
    '-an eighty kg',
    // As "stone -12, 4 lb" returns null.
    'stone -a hundred, 4 lb',
    // As "age 28 kg: -5" returns null.
    'age 28 kg: -a hundred',
    // As "12 lb -25 oz" and "70 kg -500 g" return null (the AFA-114 comment).
    '12 lb -twenty five oz',
    '70 kg -5 hundred g',
    '12 lb -a hundred oz',
    // As "12 lb -5 oz" and "12 lbs 5 and a half oz" return null.
    '12 lbs -5 and a half oz',
    // The Unicode minus sign, as "−5 ft" returns null (README).
    '−a hundred kg',
    '﹣an eighty kg',
    '−a-hundred kg',
    // A signed part drops each part of its type in its field, as in "lost -5 lbs, now 180 lbs".
    '-a hundred kg, 70 kg',
    'kg -a hundred, 70 kg',
    // As "70 kg, kg -5" returns null.
    '70 kg, kg -a hundred',
    // A semicolon between a number and its unit drops both fields, as in "6 ft -5;ft".
    '70 kg -a hundred; kg',
  ])('returns null for %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it.each([
    // The ticket's "must not change" results.
    ['a hundred kg', 100, 'kg'],
    // "-a" isn't before a number, so the unit before "five" takes it, as in "-x st 4 lb".
    ['-a lbs five', 5, 'lb'],
    // "a" doesn't start a number in digits, so its sign doesn't sign 12.
    ['-a 12 lb', 12, 'lb'],
    // A semicolon after "a" ends the phrase, so the sign doesn't reach "hundred".
    ['-a; hundred kg', 100, 'kg'],
    // "5 12" isn't one number, so the sign on 5 doesn't sign 12.
    ['-5 12 kg', 12, 'kg'],
    // A minus sign before a word doesn't make the word a number, as in "-x st 4 lb".
    ['-and 5 kg', 5, 'kg'],
    // A sign after the first word doesn't sign the phrase before it, as in "5 ft -11" (5 ft).
    ['kg twenty -five', 20, 'kg'],
    // A semicolon separates fields, so the signed part drops only its own field, as in
    // "invalid -5 ft; actual 180 cm" (180 cm).
    ['-a hundred kg; 70 kg', 70, 'kg'],
    ['70 kg one; -eighty kg', 70, 'kg'],
  ] as const)('reads %s as %s %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit });
  });
});
