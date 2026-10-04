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
});
