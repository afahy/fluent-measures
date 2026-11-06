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
    // Without an opening quote, an ASCII apostrophe attached to a word keeps that boundary.
    ["12kilo 6 'foot", 12, 'kg'],
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

  // Independent probes: the ticket permits a full compound or null, never only the inches.
  // Use the same 5 × 12 + 11 result when either component is written in words.
  it.each(['‘5’ eleven”', '‘five’ 11”', '‘five’ eleven”'])('keeps both parts of %s', raw => {
    expect(parseMeasurement(raw)).toMatchObject({ value: 71, unit: 'in' });
  });

  // Half an inch can start with a decimal separator or a Unicode fraction: 5 × 12 + 0.5.
  it.each(['‘5’ .5”', '‘5’ ,5”', '‘5’ ½”'])('keeps fractional inches in %s', raw => {
    expect(parseMeasurement(raw)).toMatchObject({ value: 60.5, unit: 'in' });
  });

  it.each(['‘5’ 11 inches', '‘five’ eleven inches', "‘5’ 11''", '‘5’ 11’’'])(
    'keeps the inch component after quoted feet in %s',
    raw => {
      expect(parseMeasurement(raw)).toMatchObject({ value: 71, unit: 'in' });
    }
  );

  it('keeps the following unit with a number word in mixed quotation marks', () => {
    expect(parseMeasurement('"seventy” kilograms')).toMatchObject({ value: 70, unit: 'kg' });
  });

  // Case never changes a unit. Both quoted measurements must be recognized: 154 lb is
  // 69.85322498 kg, within 1% of 70 kg (the documented conversion-agreement example).
  it.each([
    '"70" KG',
    '70” KG',
    '“seventy”kg',
    '‘seventy’kg',
    '"70" kg; "154" lbs',
    '“about 70” kg; “about 154” lbs',
  ])('retains named units throughout %s', raw => {
    expect(parseMeasurement(raw)).toMatchObject({ value: 70, unit: 'kg', type: 'weight' });
  });

  // A separate number is not an inches component of a quoted quantity (Codex round 2).
  it.each(['“72” 180 cm', '‘5’ 180 cm', '“seventy two” 180 cm'])(
    'keeps the separate measurement after %s',
    raw => {
      expect(parseMeasurement(raw)).toMatchObject({ value: 180, unit: 'cm', type: 'height' });
    }
  );

  it.each(['“72” 180', 'he said ‘it’s five’', 'he said ‘that’s six and a half’'])(
    'preserves the unitless quotation in %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  it('retains a following weight after a quotation containing an apostrophe', () => {
    expect(parseMeasurement('he said ‘it’s five’ and weighs 180 lbs')).toMatchObject({
      value: 180,
      unit: 'lb',
      type: 'weight',
    });
  });

  // "In" is prose after an existing feet mark, as for ASCII apostrophes and primes.
  it.each(['he is 6’ in height', '6’ in shoes', 'six’ in height', '6’ IN shoes'])(
    'reads the unquoted feet mark in %s',
    raw => {
      expect(parseMeasurement(raw)).toMatchObject({ value: 6, unit: 'ft', type: 'height' });
    }
  );

  // A genuine quoted quantity still takes the following named inch unit.
  it.each(['‘6’ in', '‚6’ in', '‘it’s six’ in', "'it’s six’ in", '“6” in', '"6" in'])(
    'retains the explicit inch unit after %s',
    raw => {
      expect(parseMeasurement(raw)).toMatchObject({ value: 6, unit: 'in', type: 'height' });
    }
  );

  // A completed quotation cannot hide a later unit mark. The ticket's number-word marks
  // represent the same six feet or inches as numeric marks.
  it.each([
    ['‘hello’ six’', 'ft'],
    ['“hello” six”', 'in'],
  ])('keeps the mark after the completed quotation in %s', (raw, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value: 6, unit, type: 'height' });
  });

  it('does not make a double quotation part of a following inch measurement', () => {
    expect(parseMeasurement('“72” 60 inches')).toMatchObject({ value: 60, unit: 'in' });
  });

  // Preserve the existing adjacent-digit rule. 72 inches is 182.88 cm, not 180 cm, so the
  // two explicit heights conflict under PARSING.md's multiple-measurement rule.
  it('preserves the compact adjacent-digit interpretation of a double mark', () => {
    expect(parseMeasurement('“72”180 cm')).toBeNull();
  });
});
