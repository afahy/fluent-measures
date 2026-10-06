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

  it.each([
    ['5\'11"', 71, 'in'],
    ['5\' 11"', 71, 'in'],
    ['6 ft (72 in)', 6, 'ft'],
    ["I'm about 180 lbs", 180, 'lb'],
    ["the dog's 5 kg bowl", 5, 'kg'],
    // A curly apostrophe in prose is still an apostrophe.
    ['I’m about 180 lbs', 180, 'lb'],
    // Curly quotation marks around a measurement aren't feet or inch marks.
    ['He said ‘180 lbs’', 180, 'lb'],
    ['weight: “180 lbs”', 180, 'lb'],
    ['the ‘5 kg’ bag', 5, 'kg'],
    // A closing quote after a quoted number is a quotation mark too, so the unit after it counts.
    ['He said “180” cm', 180, 'cm'],
    ['the ‘5’ kg bag', 5, 'kg'],
    ['“180” lbs', 180, 'lb'],
    ['‘180’ lbs', 180, 'lb'],
  ] as const)('keeps reading %s as %s %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit });
  });
});
