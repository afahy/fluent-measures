// AFA-250: recovery expectations now follow the approved complete-entry contract in PARSING.md.
// Earlier ticket rationales below describe their historical extraction contract; original
// assertions are retained separately under design/afa-250.
import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

// AFA-112: a hyphen after a feet or inch mark joins two values as it does after a unit word. The
// digits before the mark must start a token, and a number word may come after the hyphen. Each
// expected result is the ticket's, from the same input with a unit word in place of the mark.
describe('a hyphen after a feet or inch mark', () => {
  it.each([
    ['6\'1"-seventy kg', { type: 'weight' }],
    ['5;"-5 in', {}],
    ['five;"-5 in', {}],
    ['5ft11"-185 lbs', {}],
    ['5 ft11"-185 lbs', {}],
    ['five ft11"-185 lbs', {}],
    ['5;ft11"-185 lbs', {}],
    ['1m80"-5 in', {}],
    ['5"-5 in', {}],
    ['6\'1"-185 lbs', { type: 'weight' }],
  ] as const)('rejects the complete entry %s (AFA-250)', (raw, options) => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });
  it.each([
    [`5'-eleven`, {}, 71, 'in'],
    [`five'-eleven`, {}, 71, 'in'],
    [`5'-11"`, {}, 71, 'in'],
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
    // The number before the unit must start the token too.
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

  it.each(['5ft11"-185 lbs', '5 ft11"-185 lbs', 'five ft11"-185 lbs', '5;ft11"-185 lbs'])(
    'rejects the dash-separated pair with either selector: %s',
    raw => {
      expect(parseMeasurement(raw, { type: 'height' })).toBeNull();
      expect(parseMeasurement(raw, { type: 'weight' })).toBeNull();
    }
  );

  it.each(['5 ft 11"-185 lbs', 'five ft 11"-185 lbs', '5;ft 11"-185 lbs'])(
    'rejects the spaced dash-separated pair: %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
      expect(parseMeasurement(raw, { type: 'height' })).toBeNull();
      expect(parseMeasurement(raw, { type: 'weight' })).toBeNull();
    }
  );

  it('spaced counterpart exposes the conflicting metric and inch heights', () => {
    expect(parseMeasurement('1 m 80"-5 in')).toBeNull();
  });

  // The "11" comes after a hyphen, not at a token's start, so the second hyphen stays a minus
  // sign, as in `5 ft-11 in-185 lbs` (null).
  it('returns null for 5\'-11"-185 lbs with type weight', () => {
    expect(parseMeasurement(`5'-11"-185 lbs`, { type: 'weight' })).toBeNull();
  });
});
