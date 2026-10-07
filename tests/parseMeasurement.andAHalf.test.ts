import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

// AFA-63: "and a half" after a whole number adds 0.5, for digits and number words.
describe('and a half', () => {
  it.each([
    // The inputs from AFA-63. After a feet part with no inch unit, the half belongs to the inches:
    // 5 × 12 + 10.5 = 70.5.
    ['5 foot 10 and a half', 70.5, 'in'],
    ['1 and a half meters', 1.5, 'm'],
    ['six and a half feet', 6.5, 'ft'],
    // With an inch unit after the half, and with number words: 5 × 12 + 11.5 = 71.5.
    ['5 foot 10 and a half inches', 70.5, 'in'],
    ['five foot eleven and a half', 71.5, 'in'],
    ['seventy and a half kg', 70.5, 'kg'],
  ] as const)('reads %s as %s %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit });
  });

  // "Must not change" in AFA-63, from the README and the corpus.
  it.each([
    ['one hundred and 50 pounds', 150, 'lb'],
    ['5 foot 10 inches', 70, 'in'],
    ['a hundred and sixty pounds', 160, 'lb'],
    // "a half-hour" with no number before "and" doesn't add to the feet.
    ['5 ft and a half-hour walk', 5, 'ft'],
    // Only the words "and a half" add 0.5, so other words after 10 leave 5 × 12 + 10 = 70 in.
    ['5 ft 10 and a hat', 70, 'in'],
    ['5 ft 10 and the half', 70, 'in'],
    ['5 ft 10 a half', 70, 'in'],
  ] as const)('keeps reading %s as %s %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit });
  });

  // Only a whole number takes "and a half", and "a half" needs a number before it.
  it.each(['1.5 and a half m', 'a half inch', 'and a half feet'])('returns null for %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  // "1 and a half and a half" isn't a number, so the input has no measurement. Reading it back
  // must not call itself once for each "and a half", which overflowed the stack.
  it('returns null for many copies of "and a half"', () => {
    expect(parseMeasurement(`1${' and a half'.repeat(10_000)} m`)).toBeNull();
  });

  // AFA-94: a multiplier word after "and a half" multiplies the whole number plus 0.5, so
  // "two and a half thousand" is 2.5 × 1000 = 2500, and "five and a half hundred" is 550.
  it.each([
    ['two and a half thousand pounds', 2500, 'lb'],
    ['2 and a half thousand lbs', 2500, 'lb'],
    ['five and a half hundred pounds', 550, 'lb'],
    // A semicolon can come between a number and its unit, as in "180;lbs" (README).
    ['two and a half thousand; lbs', 2500, 'lb'],
    // AFA-63's results don't change: a multiplier that starts the next number isn't the half's.
    // 5 × 12 + 10.5 = 70.5.
    ['5 ft 10 and a half, hundred eighty lbs', 70.5, 'in'],
    // More than one multiplier: 2.5 × 100 × 1000 = 250,000.
    ['two and a half hundred thousand pounds', 250_000, 'lb'],
    // A semicolon between the half and the multiplier, and with no multiplier, as in "6.5; ft".
    ['two and a half; thousand lbs', 2500, 'lb'],
    ['6 and a half; ft', 6.5, 'ft'],
    // The whole number is smaller than the multiplier, as in "one hundred thousand": 100.5 × 1000.
    ['one hundred and a half thousand lbs', 100_500, 'lb'],
    // With no number before it, "and a half" isn't read, as in "and a half feet" (null above), so
    // only "thousand" is, as on main.
    ['and a half thousand pounds', 1000, 'lb'],
  ] as const)('reads %s as %s %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit });
  });

  // As in "two hundred thousand", each multiplier must be smaller than the one after it, and the
  // whole number smaller than the nearest one. Only a whole number takes "and a half", as
  // "1.5 and a half m" shows, and a measurement can't be negative. So none of these has a number
  // before the unit, and the half isn't dropped to read only the multiplier, as it was on main.
  it.each([
    'two thousand and a half hundred lbs',
    'one thousand and a half thousand pounds',
    'two and a half thousand thousand lbs',
    'two and a half thousand hundred lbs',
    '1.5 and a half thousand lbs',
    '-2 and a half thousand lbs',
    // A semicolon can come between a number and the next word (README: "180;lbs").
    '-2; and a half thousand lbs',
  ])('returns null for %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  // A signed part drops its field, as "-2.5 ft 4" and "70 kg -2.5 lbs" do, with and without a
  // multiplier after the half.
  it.each([
    '-2 and a half ft 4',
    '-2 and a half thousand ft 4',
    '70 kg -2 and a half thousand lbs',
  ])('returns null for the signed part in %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  // "1.5 and a half thousand" isn't a number, so "ft" has no number before it, and it takes the
  // number after it, as a unit before its number does (README: "record 0; kg 70" → 70 kg).
  it('reads 1.5 and a half thousand ft 4 as 4 ft', () => {
    expect(parseMeasurement('1.5 and a half thousand ft 4')).toMatchObject({
      value: 4,
      unit: 'ft',
    });
  });

  // A read forward stops before a multiplier after "and a half", as "pounds: two and a half
  // thousand" (2.5 lb) shows. So stone has its own number, 2.5, and "thousand lb" is another part,
  // which gives null, as "stone 12, 4 lb" does in the README.
  it('returns null for a stone amount before another weight part', () => {
    expect(parseMeasurement('stone two and a half thousand lb')).toBeNull();
  });
});
