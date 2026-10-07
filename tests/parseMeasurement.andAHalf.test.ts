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
    // Reading forward after a label.
    ['pounds: two and a half thousand', 2500, 'lb'],
  ] as const)('reads %s as %s %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit });
  });
});
