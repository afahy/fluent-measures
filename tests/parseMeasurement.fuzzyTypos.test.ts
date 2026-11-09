// AFA-280: the fuzzy typo list in PARSING.md, "Fuzzy Matching". Each typo reads as its unit or
// number word with `fuzzy: true` only. Each expected value is the value of the intended spelling.
import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions } from '../src';
import { tokenize } from '../src/tokenize';

const off: (ParseOptions | undefined)[] = [undefined, {}, { fuzzy: false }];

describe('the unit typos on the fuzzy typo list', () => {
  it.each([
    // "lbss" doubles the s of "lbs".
    ['180 lbss', 180, 'lb', 'weight'],
    // "Ibs" has a capital I for the l of "lbs".
    ['180 Ibs', 180, 'lb', 'weight'],
    ['180 ibs', 180, 'lb', 'weight'],
    // "cenitmeters" swaps the t and i of "centimeters".
    ['180 cenitmeters', 180, 'cm', 'height'],
    ['70 kilgrm', 70, 'kg', 'weight'],
  ] as const)('reads %s with fuzzy only', (raw, value, unit, type) => {
    expect.assertions(4);
    expect(parseMeasurement(raw, { fuzzy: true })).toEqual({
      value,
      unit,
      type,
      raw,
      matches: [{ value, unit }],
    });
    for (const options of off) expect(parseMeasurement(raw, options)).toBeNull();
  });
});

describe('the number-word typos on the fuzzy typo list', () => {
  it.each([
    // "fourty" adds a u to "forty"; "ninty" drops the e of "ninety".
    ['fourty kg', 40, 'kg'],
    ['Fourty kg', 40, 'kg'],
    ['ninty kg', 90, 'kg'],
    // They join other number words as the words they stand for: 40 + 2, 90 + 5 and 100 + 40.
    ['fourty-two kg', 42, 'kg'],
    ['fourty two kg', 42, 'kg'],
    ['ninty five pounds', 95, 'lb'],
    ['one hundred and fourty pounds', 140, 'lb'],
    // Spoken hundreds, as "one forty" is 140.
    ['one fourty lbs', 140, 'lb'],
    // A final period stays punctuation, as it does after "forty".
    ['fourty kg.', 40, 'kg'],
    ['I weigh about fourty kg', 40, 'kg'],
  ] as const)('reads %s with fuzzy only', (raw, value, unit) => {
    expect.assertions(4);
    expect(parseMeasurement(raw, { fuzzy: true })).toEqual({
      value,
      unit,
      type: 'weight',
      raw,
      matches: [{ value, unit }],
    });
    for (const options of off) expect(parseMeasurement(raw, options)).toBeNull();
  });

  it('reads a number-word typo with a default unit', () => {
    expect(parseMeasurement('fourty', { fuzzy: true, defaultUnit: 'kg' })).toMatchObject({
      value: 40,
      unit: 'kg',
    });
    expect(parseMeasurement('fourty', { defaultUnit: 'kg' })).toBeNull();
  });

  // Both typos are read: the weight of the pair is "ninety kg".
  it('reads each typo in a pair', () => {
    const raw = 'fourty in, ninty kg';
    expect(parseMeasurement(raw, { fuzzy: true, type: 'weight' })).toMatchObject({
      value: 90,
      unit: 'kg',
    });
    expect(parseMeasurement(raw, { fuzzy: true, type: 'height' })).toMatchObject({
      value: 40,
      unit: 'in',
    });
    expect(parseMeasurement(raw, { type: 'weight' })).toBeNull();
  });

  // A typo reads only as a whole word, the way "forty" does: "fortyfive kg" and "forty5 kg" are
  // null.
  it.each(['fourtyfive kg', 'fourty5 kg', 'xfourty kg'])('returns null for %s', raw => {
    expect(parseMeasurement(raw, { fuzzy: true })).toBeNull();
  });

  // The tokenizer writes only number-word typos; matchUnit reads unit typos (src/units.ts).
  it('writes number-word typos, and leaves unit typos for matchUnit', () => {
    const texts = (fuzzy?: boolean): string[] =>
      tokenize('fourty kilgrm NINTY', fuzzy).map(({ text }) => text);
    expect(texts(true)).toEqual(['forty', 'kilgrm', 'ninety']);
    expect(texts()).toEqual(['fourty', 'kilgrm', 'ninty']);
  });
});

// AFA-280 "Must not change": the usability grader's T6.
describe('T6', () => {
  it('reads 5 fet 11 inchs as 71 in with fuzzy only', () => {
    expect(parseMeasurement('5 fet 11 inchs', { fuzzy: true })).toMatchObject({
      value: 71,
      unit: 'in',
    });
    expect(parseMeasurement('5 fet 11 inchs')).toBeNull();
  });
});
