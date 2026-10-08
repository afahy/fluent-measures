import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

describe('unsupported weight units', () => {
  it.each([
    '12st 4lb',
    '12 stone 4 pounds',
    'twelve stone four pounds',
    '7 lb 8 oz',
    '7lbs 8oz',
    '3 kg 400 g',
    '11st 4lb',
    '12 stones 4 lb',
    '7 pounds 8 ounces',
    '7 lb 1 ounce',
    '3 kg 1 gram',
    '3 kg 400 grams',
    '12 STONE 4 LB',
    '12;st 4lb',
    '8 oz 7 lb',
    '7 lb; 8 oz',
    '8 oz; 7 lb',
    '12st; 4lb',
    '12 st 4;lb',
    'baby: 7 lb 8 oz',
    // Decimal stones, which can't be ordinals
    '10.1st 4lb',
    '1.1st 4lb',
    '111st 4lb',
    // Units written before their number
    'stone 12, 4 lb',
    'oz 8, 7 lb',
    'kg 3, 400 g',
    'lb 7, 8 oz',
    'Stone: 12, lb: 4',
    'stone twelve, four pounds',
    'ounces 8; 7 lb',
    'stone 12 and 4 lb',
    '7 lb, oz 8',
    'lb 7; oz 8',
  ])('returns null instead of a partial weight in %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it('returns null when the weight type is given', () => {
    expect(parseMeasurement('12 st 4lb', { type: 'weight' })).toBeNull();
  });

  it('returns null with fuzziness too', () => {
    expect(parseMeasurement('7 lb 8 oz', { fuzziness: 2 })).toBeNull();
  });

  it('still returns null for an unsupported unit on its own', () => {
    expect(parseMeasurement('12 stone')).toBeNull();
  });

  it.each([
    ['70 kg 5 days ago', 70, 'kg'],
    ['Oct 1st: 180 lbs', 180, 'lb'],
    ['21st birthday, 180 lbs', 180, 'lb'],
    ['May 31st, 180 lbs', 180, 'lb'],
    ['the 101st, 180 lbs', 180, 'lb'],
  ] as const)('keeps the weight in %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toEqual({
      value,
      unit,
      type: 'weight',
      raw,
      matches: [{ value, unit }],
    });
  });

  it.each([
    'stone age, 180 lbs',
    '2 big dogs, 180 lbs',
    '12 steps, 180 lbs',
    'I drink 8 oz of water, weight 180 lbs',
    'weight 180 lbs, ate 200 g of rice',
    '5G phone, 180 lbs',
    '16 oz steak; 180 lbs',
    'ate 200 g, then 3 times, 180 lbs',
    'Day 3 log: 180 lbs',
    // A capital G after a number is a network generation, not grams
    '180 lbs, 5G phone',
    '180 lbs, 4G signal',
    '180 lbs, stone wall',
    'Water (oz): 64, weight 180 lbs',
    // "st" and "g" before a number are usually other words
    'Main St 12, 180 lbs',
    'Block G 5, 180 lbs',
  ])('keeps the weight when no unsupported part is next to it in %s', raw => {
    expect(parseMeasurement(raw)?.matches).toEqual([{ value: 180, unit: 'lb' }]);
  });

  it('keeps the weight when an unsupported unit word has no number of its own', () => {
    expect(parseMeasurement('gravel and stone, 50 lb bag')?.matches).toEqual([
      { value: 50, unit: 'lb' },
    ]);
  });

  it('reads an unsupported unit only when the library reads a weight', () => {
    const raw = '12st 4lb, 5\'11"';
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
    expect(parseMeasurement('180 cm, 7 lb 8 oz')?.value).toBe(180);
  });

  // AFA-103: after a feet part, a number with a stone, ounce or gram unit isn't inches. It is an
  // unrelated amount, as the README says for "I drink 8 oz of water, weight 180 lbs".
  it.each([
    ['5 ft 8 oz', 5, 'ft'],
    ["5' 8 oz", 5, 'ft'],
    ['5 ft 8 ounces', 5, 'ft'],
    ['5 ft 8 g', 5, 'ft'],
    ['5 ft 8 st', 5, 'ft'],
    ['5 ft eight oz', 5, 'ft'],
    // "1st" is an ordinal, as above, so 1 stays inches: 5 × 12 + 1 = 61. "11st" is stone.
    ['5 ft 1st place', 61, 'in'],
    ['5 ft 11st', 5, 'ft'],
    // "Must not change" in AFA-103: 5 × 12 + 8 = 68.
    ['5 ft 8', 68, 'in'],
    ['5 ft 8 in', 68, 'in'],
  ] as const)('reads %s as %s %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit });
  });

  // An amount with an unsupported unit acts as a supported weight does after feet. So
  // `5 ft 8 lbs 3 in` gives 5 × 12 + 3 = 63 in, and `5 ft 8 kg 11 in` gives 71 in.
  it.each([
    ['5 ft 8 oz 3 in', 63],
    ['5 ft 8 g 11 in', 71],
  ] as const)('joins the feet and inches around the amount in %s: %s in', (raw, value) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit: 'in' });
  });

  // The only height left is a zero, which doesn't count. And 5 ft and 68 in are two heights that
  // disagree, as in `5 ft 8 lbs; 68 in`.
  it.each(['0 ft 8 oz', '5 ft 8 oz; 68 in', '5 ft 8 grams, 68 in'])('returns null for %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });
});
