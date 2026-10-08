import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

// AFA-112: a hyphen after a feet or inch mark joins two values as it does after a unit word. The
// digits before the mark must start a token, and a number word may come after the hyphen. Each
// expected result is the ticket's, from the same input with a unit word in place of the mark.
describe('a hyphen after a feet or inch mark', () => {
  it.each([
    // 5 × 12 + 11 = 71, as `5 ft-eleven`.
    [`5'-eleven`, {}, 71, 'in'],
    // The weight after the height, as `6 ft 1 in-seventy kg`.
    [`6'1"-seventy kg`, { type: 'weight' }, 70, 'kg'],
    // A semicolon before the mark, as `5;in-5 in` and `5;" 5 in`.
    ['5;"-5 in', {}, 5, 'in'],
    // A number word before the mark, as `five ft-eleven` and `five;in-5 in`.
    [`five'-eleven`, {}, 71, 'in'],
    ['five;"-5 in', {}, 5, 'in'],
    // Digits after a number and a unit count as a number, as `5ft11in-185 lbs` and `1m80in-5 in`.
    ['5ft11"-185 lbs', {}, 185, 'lb'],
    ['5 ft11"-185 lbs', {}, 185, 'lb'],
    // A number word or a semicolon before the unit, as `five ft11in-185 lbs` and
    // `5;ft11in-185 lbs`.
    ['five ft11"-185 lbs', {}, 185, 'lb'],
    ['5;ft11"-185 lbs', {}, 185, 'lb'],
    ['1m80"-5 in', {}, 5, 'in'],
    // "Must not change" in AFA-112.
    [`5'-11"`, {}, 71, 'in'],
    ['5"-5 in', {}, 5, 'in'],
    [`6'1"-185 lbs`, { type: 'weight' }, 185, 'lb'],
  ] as const)('reads %s with %j as %s %s', (raw, options, value, unit) => {
    expect(parseMeasurement(raw, options)).toMatchObject({ value, unit });
  });

  it.each([
    // "x11" isn't a number, so the hyphen is a minus sign, as in `x11 in-5 in`.
    'x11"-5 in',
    // The second "5" comes after a hyphen, not at a token's start, as in `5 in-5 in-5 in`.
    '5"-5"-5"',
    // Letters, or letters and a period, before the digits, as in `abc5 in-5 in`.
    'abc5"-5 in',
    // CodeRabbit on #97: the number before the unit must start the token too.
    'abc5ft11"-5 in',
    'x.5"-5 in',
    // A mark that closes a quotation, as on main (AFA-93).
    '"ten"-5 kg',
    // "Must not change" in AFA-112: two heights.
    '72"-74"',
    `5'11"-6'1"`,
  ])('returns null for %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  // The "11" comes after a hyphen, not at a token's start, so the second hyphen stays a minus
  // sign, as in `5 ft-11 in-185 lbs` (null). On main this was 185 lb (decision rule 3, listed on
  // #97 and AFA-112).
  it('returns null for 5\'-11"-185 lbs with type weight', () => {
    expect(parseMeasurement(`5'-11"-185 lbs`, { type: 'weight' })).toBeNull();
  });
});
