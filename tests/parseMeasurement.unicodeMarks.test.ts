// AFA-250: recovery expectations now follow the approved complete-entry contract in PARSING.md.
// Earlier ticket rationales below describe their historical extraction contract; original
// assertions are retained separately under design/afa-250.
import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

// Inputs and results from AFA-61, which come from the AFA-41 corpus.
describe('Unicode quote marks and forms', () => {
  it.each([
    ['5’11”', {}, 71, 'in'],
    ['5’ 11”', {}, 71, 'in'],
    ['6’', {}, 6, 'ft'],
    ['72”', {}, 72, 'in'],
    ['5’11', {}, 71, 'in'],
    ['5’11’’', {}, 71, 'in'],
    ['5′11″', {}, 71, 'in'],
    ['5′ 11″', {}, 71, 'in'],
    ['6′', {}, 6, 'ft'],
    ['72″', {}, 72, 'in'],
    ['5´11´´', {}, 71, 'in'],
    ['１８０ｃｍ', {}, 180, 'cm'],
    ['180 ㎝', {}, 180, 'cm'],
    ['70 ㎏', {}, 70, 'kg'],
  ] as const)('reads %s with %o as %s %s', (raw, options, value, unit) => {
    expect(parseMeasurement(raw, options)).toMatchObject({ value, unit });
  });

  // 71 in × 2.54 = 180.34 cm. Only this conversion needs a tolerance.
  it('converts 5’11” to 180.34 cm', () => {
    expect(parseMeasurement('5’11”', { type: 'height', normalizedUnit: 'cm' })).toMatchObject({
      value: expect.closeTo(180.34, 2),
      unit: 'cm',
    });
  });

  it.each(['‘90s 5’11”', '‘bout 5’11”', 'the ‘5’11” guy'])(
    'rejects the complete entry %s (AFA-250)',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );
  it.each([
    ['5½’', 5.5, 'ft'],
    ['72½″', 72.5, 'in'],
    ['5 ′ 11 ″', 71, 'in'],
    ['5 ´11', 71, 'in'],
  ] as const)('reads %s as %s %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit });
  });

  // A number in curly quotes with no unit is a quotation, as on main.
  it.each(['“72”', 'he is “72” tall'])('returns null for %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it.each([
    "the dog's 5 kg bowl",
    'He said ‘180 lbs’',
    'the ‘5 kg’ bag',
    'He said “180” cm',
    'the ‘5’ kg bag',
    'the ‘5½’ kg bag',
  ])('rejects the complete entry %s (AFA-250)', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });
  it.each([
    ['5\'11"', 71, 'in'],
    ['5\' 11"', 71, 'in'],
    ["I'm about 180 lbs", 180, 'lb'],
    ['I’m about 180 lbs', 180, 'lb'],
  ] as const)('keeps reading %s as %s %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit });
  });

  it('rejects an independent conversion after feet', () => {
    // AFA-250 retains the literal preservation case with the approved duplicate policy.
    expect(parseMeasurement('6 ft (72 in)')).toBeNull();
  });

  // AFA-277: quotation marks and brackets cannot surround an entry or a number.
  it.each(['‘5’11”’', 'weight: “180 lbs”', '“180” lbs', '‘180’ lbs', '“5 1/2” ft'])(
    'rejects the wrapped %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );
});
