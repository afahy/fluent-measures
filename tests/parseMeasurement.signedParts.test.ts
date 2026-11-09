// AFA-250: recovery expectations now follow the approved complete-entry contract in PARSING.md.
// Earlier ticket rationales below describe their historical extraction contract; original
// assertions are retained separately under design/afa-250.
import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions } from '../src';
import { parseWithin, underStryker } from './timing';

// Each input with the Unicode minus sign (U+2212) in place of each hyphen-minus before a digit.
const unicode = (raw: string): string => raw.replace(/-(?=[\d.])/g, '−');

// Inputs and results from AFA-80 and its comments.
describe('signed parts', () => {
  // A range that repeats its unit is two measurements that disagree (PARSING.md). After a number
  // and its unit, a hyphen joins two parts or values and isn't a sign.
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
  // "5 in-5 in". AFA-250 now rejects even equal independent values. The double prime,
  // the right double quote and the full-width quote read as
  // an inch mark too (AFA-61). A space can come between the number and the mark, as in '5 "'.
  it.each(['5"-5 in', '5″-5 in', '5”-5 in', '5＂-5 in', '5 "-5 in'])(
    'rejects equal independent heights in %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  // A weight after a height with marks reads as it does after the same height in words, as in
  // "6 ft 1 in-185 lbs" (185 lb). The hyphen after the inch mark doesn't sign the weight.
  it('rejects a signed weight after a height', () => {
    expect(parseMeasurement('6\'1"-185 lbs', { type: 'weight' })).toBeNull();
  });

  // PARSING.md's "1 m 80 cm" is one height: 100 + 80 = 180 cm.
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
    // A number and its unit can stand on two sides of a semicolon, as in "180;lbs" (PARSING.md).
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
  it('rejects a signed height before a weight', () => {
    expect(parseMeasurement('-5 ft, 150 lbs')).toBeNull();
  });

  // From PARSING.md unless marked.
  it.each([
    // Existing test: a minus sign before a height.
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
    ['record 0; kg 70', {}],
    ['0 feet; actual 1.8 meters', {}],
    ['invalid -5 ft; actual 180 cm', {}],
    ['temp -5, weight 70 kg', {}],
    ['in -5 degrees, 70 kg', {}],
    ['temp=-5, kg=72', {}],
    ['Change: -2, kg: 70', {}],
    ['score -2, in: 72', {}],
    ['Delta: -2; lbs: 180', {}],
    ['-3 kg=70', {}],
    ['offset -3 (kg) 70', {}],
    ['Main St -12, 180 lbs', {}],
    ['g -2, 70 kg', {}],
    ['-x st 4 lb', {}],
    ['-approx kg, 70 kg', {}],
    ['-1st 70 kg', {}],
    ['-8 oz of water, 70 kg', {}],
    ['5 and ft -11', {}],
  ] as const)('rejects the complete entry %s (AFA-250)', (raw, options) => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });
  it.each([
    ['5 ft-11', {}, 71, 'in'],
    ['5\'-11"', {}, 71, 'in'],
    ['5-foot-11', {}, 71, 'in'],
  ] as const)('keeps reading %s with %o as %s %s', (raw, options: ParseOptions, value, unit) => {
    expect(parseMeasurement(raw, options)).toMatchObject({ value, unit });
  });

  // A signed weight doesn't cancel a height either.
  it('rejects a signed weight before a height', () => {
    expect(parseMeasurement('-12 st, 6 ft')).toBeNull();
  });

  // A semicolon can stand inside one measurement, as in "180;lbs" (PARSING.md), so "-5;ft" is a
  // signed part, and the fields on both sides of it go.
  it('returns null for a signed part across a semicolon', () => {
    expect(parseMeasurement('6 ft -5;ft')).toBeNull();
  });

  // Only a leading minus sign makes a signed number. "x--5" isn't a number at all.
  it('rejects unknown signed fragments before weight', () => {
    expect(parseMeasurement('x--5 kg, 70 kg')).toBeNull();
  });

  // A signed value with its own unit isn't the label's value, a semicolon can stand between a
  // number and its unit, and implied inches belong to their own field.
  it.each(['180 cm = -82 kg', '72 in: -180 lbs', '1;m-80 cm', '1;;m-80 cm', '5 ft 11; -2 cm'])(
    'rejects the complete entry %s (AFA-250)',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  it('rejects equal independent weights with a semicolon before the unit', () => {
    // AFA-250 changes reconciliation, not the earlier semicolon traversal in this slice.
    expect(parseMeasurement('180;lbs-180 lbs')).toBeNull();
  });

  // Each signed label value is read without its sign in place, not in a copy of the tokens. Here,
  // with 20,000 signed labels, a copy took 10.7 s of clock time. The current code takes about
  // 140 ms of CPU time, or 240 ms with coverage. In CI's coverage runs it took up to 630 ms of
  // clock time (AFA-95) and up to 720 ms of CPU time (AFA-171). So the 4 s limit of CPU time
  // leaves more than 5 times that. The test skips itself under Stryker.
  it.skipIf(underStryker)('reads many signed label values quickly', () => {
    expect(parseWithin('kg: -5 '.repeat(20_000), 4000, { maxLength: Infinity })).toBeNull();
  });

  // "5 ft -11" has no inch unit, so -11 isn't a part (existing test).
  it('rejects negative bare inches instead of retaining the feet', () => {
    expect(parseMeasurement('5 ft -11')).toBeNull();
  });

  // AFA-90 item 1: a signed part drops only parts of its own type, as "-5 ft, 150 lbs" (150 lb)
  // shows. So a signed value with its own unit of the other type keeps the label's field.
  describe('marked labels with signed values of the other type', () => {
    it.each([
      ['Height (in): -82 kg, 72 in', {}],
      ['Height (in): -82 kg, 72 in', { type: 'height' }],
      ['in: -180 lbs, 72 in', {}],
      ['Weigh in: -180 lbs, 72 in', {}],
      ['cm: -5 lbs, 180 cm', {}],
      ['kg: -6 ft, 70 kg', {}],
      ['kg: -6 ft, 70 kg', { type: 'weight' }],
    ] as const)('rejects the complete entry %s (AFA-250)', (raw, options) => {
      expect(parseMeasurement(raw, options)).toBeNull();
    });
  });

  // AFA-90 item 2: a semicolon before the number doesn't stop the join, so each gives the result
  // of the same input with a space for the hyphen, as "1 m-80 cm" (180 cm) does.
  describe('semicolon joins before a number', () => {
    it.each([
      ['70 kg;5 ft-11 in', {}],
      ['1 ; m-80 cm', {}],
      [';1 m-80 cm', {}],
      ['180 ; lbs-180 lbs', {}],
    ] as const)('rejects the complete entry %s (AFA-250)', (raw, options) => {
      expect(parseMeasurement(raw, options)).toBeNull();
    });
    it.each([['70 kg;5 ft-11 in', { type: 'height' }, 71, 'in']] as const)(
      'reads %s with %o as %s %s',
      (raw, options: ParseOptions, value, unit) => {
        expect(parseMeasurement(raw, options)).toMatchObject({ value, unit });
      }
    );
  });

  // 70 kg and 180 lb disagree, so the input has no single weight.
  it('returns null for 70 kg;180 lbs-180 lbs', () => {
    expect(parseMeasurement('70 kg;180 lbs-180 lbs')).toBeNull();
  });

  // AFA-90 item 3: a label's value keeps its words without the sign, so it reads as the same value
  // in digits does: "180 cm = -82 kg" is 180 cm, and "age 28 kg: -5" is null.
  describe('signed number words after labels', () => {
    it.each([
      ['180 cm = -twenty five kg', {}],
      ['180 cm = -twenty five kg', { type: 'height' }],
      ['72 in: -one eighty lbs', {}],
    ] as const)('rejects the complete entry %s (AFA-250)', (raw, options) => {
      expect(parseMeasurement(raw, options)).toBeNull();
    });
  });

  // AFA-90 items 3 and 5: a sign on the first word of a phrase in words signs the whole phrase,
  // as "-5 feet" returns null (existing test). A number too large for digits reads as
  // "age 28 kg: -5" does.
  it.each([
    'age 28 kg: -1000000000000000000000',
    '-twenty five kg',
    '-forty-five kg',
    '-one hundred eighty lbs',
    // As "stone 25, 4 lb" returns null.
    'stone -twenty five, 4 lb',
    // Two signs are a sign too, as "--12 st 4 lb" is.
    'age 28 kg: --5',
    // A quote before a unit doesn't make a number, so the sign stays, as in "kg-70.5" (PARSING.md).
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
    // The Unicode minus sign, as "−5 ft" returns null (existing test).
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
    '-a lbs five',
    '-a 12 lb',
    '-a; hundred kg',
    '-5 12 kg',
    '-and 5 kg',
    'kg twenty -five',
    '-a hundred kg; 70 kg',
    '70 kg one; -eighty kg',
  ])('rejects the complete entry %s (AFA-250)', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });
  it.each([['a hundred kg', 100, 'kg']] as const)('reads %s as %s %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit });
  });
});
