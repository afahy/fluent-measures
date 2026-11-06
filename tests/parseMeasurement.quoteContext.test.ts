import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

// AFA-78's description and comments supply these inputs and expected units. Compound heights
// are hand calculated: 5 × 12 + 11 = 71 and 5 × 12 + 10 = 70.
describe('quotation context and spaced unit marks', () => {
  it.each([
    ['he said “about 180” lbs', 180, 'lb'],
    ['“~180” lbs', 180, 'lb'],
    ['weighs “around 70” kg', 70, 'kg'],
    ['the ‘roughly 5’ kg bag', 5, 'kg'],
    ['„180” lbs', 180, 'lb'],
    ['”180” lbs', 180, 'lb'],
    ['"180” lbs', 180, 'lb'],
    ['‚5’ kg', 5, 'kg'],
    ['5 ’11”', 71, 'in'],
    ['5 ’ 11”', 71, 'in'],
    ['‘5’ 11”', 71, 'in'],
    ['5ʹ11ʺ', 71, 'in'],
    ['He said “about 180” cm', 180, 'cm'],
    ['“+5” kg', 5, 'kg'],
    ['He said ＂180＂ cm', 180, 'cm'],
    ['＂180＂ lbs', 180, 'lb'],
    ['the ＇5＇ kg bag', 5, 'kg'],
    ['five’10”', 70, 'in'],
    ['five’ ten”', 70, 'in'],
    ['six’', 6, 'ft'],
    ['"180" lbs', 180, 'lb'],
    ['the " 5" kg', 5, 'kg'],
    ['the “ 5” kg', 5, 'kg'],
  ] as const)('reads %s as %s %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit });
  });

  // The comments require the spaced pair to be a quotation like the unspaced pair, whose
  // existing null result is explicitly preserved. Ordinary inch marks still work.
  it.each([`the '' 5'' kg`, `the ''5'' kg bag`, '“72”', 'he is “72” tall'])(
    'keeps %s as a quotation',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  // Quoted number phrases remain quotations, as in AFA-93's ASCII preservation cases.
  it.each(['“twenty five”', '‘twenty five’', 'he said “about ten”', '“six and a half”'])(
    'does not give a unit to %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  it.each([
    ['5’11”', 71, 'in'],
    ['5′11″', 71, 'in'],
    ['１８０ｃｍ', 180, 'cm'],
    ['70 ㎏', 70, 'kg'],
    ['He said ‘180 lbs’', 180, 'lb'],
    ['He said “180” cm', 180, 'cm'],
    ['the ‘5’ kg bag', 5, 'kg'],
    ['“5 1/2” ft', 5.5, 'ft'],
    ['‘bout 5’11”', 71, 'in'],
    ['the ‘5’11” guy', 71, 'in'],
    ['I’m about 180 lbs', 180, 'lb'],
    ['５＇１１＂', 71, 'in'],
    ['５＇', 5, 'ft'],
    [`5'' tall`, 5, 'in'],
    [`72''`, 72, 'in'],
  ] as const)('preserves %s as %s %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit });
  });

  // Spaces, case, fractions and mixed number words keep their normal numeric meaning.
  it.each([
    ['six ’', 6, 'ft'],
    ['SIX’', 6, 'ft'],
    ['5 ’ ten and a half ”', 70.5, 'in'],
    ['six-and-a-half’', 6.5, 'ft'],
    ['5½ ’', 5.5, 'ft'],
    ['“72,5” KG', 72.5, 'kg'],
    ['“1,000” pounds', 1000, 'lb'],
    ["the '5 1/2' ft board", 5.5, 'ft'],
    ['“one hundred and 50” pounds', 150, 'lb'],
    ['tone’ 5 ft', 5, 'ft'],
    ['one’s 180 lbs', 180, 'lb'],
  ] as const)('reads contextual form %s as %s %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit });
  });

  it('retains both height components and applies the requested conversion', () => {
    const raw = '5 ’ 11”';
    expect(parseMeasurement(raw, { type: 'height', normalizedUnit: 'cm' })).toEqual({
      raw,
      type: 'height',
      unit: 'cm',
      value: expect.closeTo(180.34, 10),
      matches: [
        { value: 5, unit: 'ft' },
        { value: 11, unit: 'in' },
      ],
    });
  });

  it('does not infer a height unit from a weight quotation', () => {
    expect(parseMeasurement('he said “about 180” lbs', { type: 'height' })).toBeNull();
    expect(parseMeasurement('he said “about 180” lbs', { type: 'weight' })).toMatchObject({
      value: 180,
      unit: 'lb',
      type: 'weight',
    });
  });
});
