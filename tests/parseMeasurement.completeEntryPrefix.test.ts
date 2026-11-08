import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions } from '../src';

// AFA-250 independent probe on fd3ce236, accepted in comment 99e1ac1d.
// Literal values, 12 in/ft, 2.54 cm/in, 100 cm/m and 0.45359237 kg/lb
// independently determine these quantities. Matches always retain the written source unit.
const pairs = [
  ['cm: 181 and 72 kg', 181, 'cm', 181, 72, 'kg', 72],
  ['kg: 72 and 181 cm', 181, 'cm', 181, 72, 'kg', 72],
  ['in: 73 and 160 lbs', 73, 'in', 185.42, 160, 'lb', 72.5747792],
  ['feet 6 and 72 kg', 6, 'ft', 182.88, 72, 'kg', 72],
  ['m: 1.81 and 72 kg', 1.81, 'm', 181, 72, 'kg', 72],
  ['pounds 160 and 73 in', 73, 'in', 185.42, 160, 'lb', 72.5747792],
] as const;

const periods = [
  ['kg seventy two.', 72, 'kg', 'weight'],
  ['pounds six and a half.', 6.5, 'lb', 'weight'],
  ['m: one point eight.', 1.8, 'm', 'height'],
  ['in: seventy three.', 73, 'in', 'height'],
] as const;

describe('independent probe prefix regressions', () => {
  it.each(pairs)('selects the complete weight in %s', (raw, _h, _hu, _cm, value, unit) => {
    expect(parseMeasurement(raw, { type: 'weight' })).toEqual({
      value,
      unit,
      type: 'weight',
      raw,
      matches: [{ value, unit }],
    });
  });

  it.each(periods)('owns one final period in %s', (raw, value, unit, type) => {
    expect(parseMeasurement(raw)).toEqual({
      value,
      unit,
      type,
      raw,
      matches: [{ value, unit }],
    });
  });
});

describe('complete prefix ownership controls', () => {
  it.each(pairs)(
    'keeps both selector paths and original units in %s',
    (raw, height, heightUnit, cm, weight, weightUnit, kg) => {
      expect(parseMeasurement(raw, { type: 'height' })).toEqual({
        value: height,
        unit: heightUnit,
        type: 'height',
        raw,
        matches: [{ value: height, unit: heightUnit }],
      });
      expect(parseMeasurement(raw, { normalizedUnit: 'cm' })).toEqual({
        value: expect.closeTo(cm, 10),
        unit: 'cm',
        type: 'height',
        raw,
        matches: [{ value: height, unit: heightUnit }],
      });
      expect(parseMeasurement(raw, { normalizedUnit: 'kg' })).toEqual({
        value: expect.closeTo(kg, 10),
        unit: 'kg',
        type: 'weight',
        raw,
        matches: [{ value: weight, unit: weightUnit }],
      });
      expect(parseMeasurement(raw)).toBeNull();
      expect(parseMeasurement(raw, { fuzziness: 2 })).toBeNull();
    }
  );

  it.each([
    ['181 cm and 72 kg', 72, 'kg'],
    ['72 kg and 181 cm', 72, 'kg'],
    ['cm: one hundred eighty one and 72 kg', 72, 'kg'],
    ['kg: one hundred and fifty and 181 cm', 150, 'kg'],
    ['kg: seventy two and one hundred eighty one cm', 72, 'kg'],
    ['kg: 72 and cm: 181', 72, 'kg'],
    ['kg seventy two. and 181 cm', 72, 'kg'],
    ['cm: 181 and pounds six and a half.', 6.5, 'lb'],
  ] as const)('keeps complete phrases on both sides of %s', (raw, value, unit) => {
    expect(parseMeasurement(raw, { type: 'weight' })).toEqual({
      value,
      unit,
      type: 'weight',
      raw,
      matches: [{ value, unit }],
    });
  });

  it.each([
    ['kg seventy two', 72, 'kg', 'weight'],
    ['kg 72 .', 72, 'kg', 'weight'],
    ['seventy two kg.', 72, 'kg', 'weight'],
    ['pounds six and a half', 6.5, 'lb', 'weight'],
    ['m: one point eight', 1.8, 'm', 'height'],
    ['in: seventy three', 73, 'in', 'height'],
    ['kg one hundred and fifty.', 150, 'kg', 'weight'],
    ['kg five hundred.', 500, 'kg', 'weight'],
    ['pounds two and a half thousand.', 2500, 'lb', 'weight'],
    ['(kg seventy two.)', 72, 'kg', 'weight'],
    ['my weight is kg seventy two.', 72, 'kg', 'weight'],
    ['m: one eighty.', 180, 'm', 'height'],
  ] as const)('keeps the full numeric value in %s', (raw, value, unit, type) => {
    expect(parseMeasurement(raw)).toEqual({ value, unit, type, raw, matches: [{ value, unit }] });
  });

  it.each(['ft five eleven.', 'ft five and eleven.'])(
    'retains the bounded prefix compound in %s',
    raw => {
      expect(parseMeasurement(raw)).toEqual({
        value: 71,
        unit: 'in',
        type: 'height',
        raw,
        matches: [
          { value: 5, unit: 'ft' },
          { value: 11, unit: 'in' },
        ],
      });
    }
  );

  it.each([
    'kg: 72 and 181',
    'kg: 72 and 181 cm extra',
    'kg: 72 and and 181 cm',
    'kg: 72 and -181 cm',
    'kg: 72 and −181 cm',
    'kg: 72 and 0 cm',
    'kg: 0 and 181 cm',
    'kg: -72 and 181 cm',
    'kg: 72 and 12 stone',
    'kg: 72 and 70 kg',
    'cm: 181 and 180 cm',
    'kg: 72 and 181 cm and 73 in',
    'kg: 72 or 181 cm',
    'kg: 72; and 181 cm',
    'kg: one and two',
    'kg: one hundred and two hundred pounds',
    'kg: 72 and 181 5 cm',
    'kg seventy two..',
    'kg 72 . .',
    'kg seventy two. five',
    'kg seventy.two',
    'seventy two. kg',
    'kg seventy two. kg',
    'kg seventy two. extra',
    'kg unknown.',
    'kg one point.',
    'kg seventy and.',
    'kg seventy and and two.',
    'kg one and two.',
    'kg -seventy two.',
    'kg zero.',
    'pounds six and a half..',
    'pounds six and a half. thousand',
    'm: one point eight. five',
    'in: seventy three. pounds',
  ])('rejects the invalid complete entry %s for every selector', raw => {
    expect.hasAssertions();
    const options: ParseOptions[] = [
      {},
      { type: 'height' },
      { type: 'weight' },
      { normalizedUnit: 'cm' },
      { normalizedUnit: 'kg' },
    ];
    for (const option of options) expect(parseMeasurement(raw, option)).toBeNull();
  });

  it.each([8, 16, 32])('rejects incomplete prefix pairs with %i conjunctions', count => {
    expect.hasAssertions();
    for (const prefix of ['kg 1 and ', 'cm: 1 and ']) {
      const raw = prefix + '1 and '.repeat(count) + '1 pounds';
      expect(parseMeasurement(raw, { type: 'weight' })).toBeNull();
    }
  });
});
