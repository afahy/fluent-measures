// AFA-250: recovery expectations now follow the approved complete-entry contract in PARSING.md.
// Earlier ticket rationales below describe their historical extraction contract; original
// assertions are retained separately under design/afa-250.
import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

// AFA-78's description and comments supply these inputs and expected units. Compound heights
// are hand calculated: 5 × 12 + 11 = 71 and 5 × 12 + 10 = 70.
describe('quotation context and spaced unit marks', () => {
  it.each([
    'he said “about 180” lbs',
    '“~180” lbs',
    'weighs “around 70” kg',
    'the ‘roughly 5’ kg bag',
    'He said “about 180” cm',
    '“+5” kg',
    'He said ＂180＂ cm',
    'the ＇5＇ kg bag',
    'the " 5" kg',
    'the “ 5” kg',
  ])('rejects the complete entry %s (AFA-250 policy revision)', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });
  it.each([
    ['5 ’11”', 71, 'in'],
    ['5 ’ 11”', 71, 'in'],
    ['5ʹ11ʺ', 71, 'in'],
    ['five’10”', 70, 'in'],
    ['five’ ten”', 70, 'in'],
    ['six’', 6, 'ft'],
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
    'He said ‘180 lbs’',
    'He said “180” cm',
    'the ‘5’ kg bag',
    '‘bout 5’11”',
    'the ‘5’11” guy',
  ])('rejects the complete entry %s (AFA-250 policy revision)', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });
  it.each([
    ['5’11”', 71, 'in'],
    ['5′11″', 71, 'in'],
    ['１８０ｃｍ', 180, 'cm'],
    ['70 ㎏', 70, 'kg'],
    ['I’m about 180 lbs', 180, 'lb'],
    ['５＇１１＂', 71, 'in'],
    ['５＇', 5, 'ft'],
    [`5'' tall`, 5, 'in'],
    [`72''`, 72, 'in'],
  ] as const)('preserves %s as %s %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit });
  });

  // Spaces, case, fractions and mixed number words keep their normal numeric meaning.
  it.each(["the '5 1/2' ft board", 'tone’ 5 ft', 'one’s 180 lbs', "12kilo 6 'foot"])(
    'rejects the complete entry %s (AFA-250 policy revision)',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );
  it.each([
    ['six ’', 6, 'ft'],
    ['SIX’', 6, 'ft'],
    ['5 ’ ten and a half ”', 70.5, 'in'],
    ['six-and-a-half’', 6.5, 'ft'],
    ['5½ ’', 5.5, 'ft'],
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
    expect(parseMeasurement('he said “about 180” lbs', { type: 'weight' })).toBeNull();
  });

  it('keeps the following unit with a number word in mixed quotation marks', () => {
    expect(parseMeasurement('"seventy” kilograms')).toBeNull();
  });

  // Case never changes a unit.
  it.each(['70” KG'])('rejects the complete entry %s (AFA-250 policy revision)', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });
  // AFA-250: quoting two readings does not make them one measurement.
  it.each(['"70" kg; "154" lbs', '“about 70” kg; “about 154” lbs'])(
    'rejects duplicate quoted weights in %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  // A separate number is not an inches component of a quoted quantity (Codex round 2).
  it.each(['“72” 180 cm', '‘5’ 180 cm', '“seventy two” 180 cm'])(
    'rejects the complete entry %s (AFA-250 policy revision)',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  it.each(['“72” 180', 'he said ‘it’s five’', 'he said ‘that’s six and a half’'])(
    'preserves the unitless quotation in %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  it('rejects unrelated quoted prose before a weight', () => {
    expect(parseMeasurement('he said ‘it’s five’ and weighs 180 lbs')).toBeNull();
  });

  // "In" is prose after an existing feet mark, as for ASCII apostrophes and primes.
  it.each(['he is 6’ in height', '6’ in shoes', 'six’ in height', '6’ IN shoes'])(
    'rejects the complete entry %s (AFA-250 policy revision)',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  // A genuine quoted quantity still takes the following named inch unit.
  it.each(['‘it’s six’ in', "'it’s six’ in"])(
    'rejects the complete entry %s (AFA-250 policy revision)',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );
  // A completed quotation cannot hide a later unit mark. The ticket's number-word marks
  // represent the same six feet or inches as numeric marks.
  it.each(['‘hello’ six’', '“hello” six”'])(
    'rejects the complete entry %s (AFA-250 policy revision)',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  // AFA-277: quotation marks cannot surround a number, so a quoted number before its unit, or
  // quoted feet before inches, returns null.
  it.each([
    '„180” lbs',
    '”180” lbs',
    '"180” lbs',
    '‚5’ kg',
    '‘5’ 11”',
    '＂180＂ lbs',
    '"180" lbs',
    '“5 1/2” ft',
    '“72,5” KG',
    '“1,000” pounds',
    '“one hundred and 50” pounds',
    '‘5’ eleven”',
    '‘five’ 11”',
    '‘five’ eleven”',
    '‘5’ .5”',
    '‘5’ ,5”',
    '‘5’ ½”',
    '‘5’ 11 inches',
    '‘five’ eleven inches',
    "‘5’ 11''",
    '‘5’ 11’’',
    '"70" KG',
    '“seventy”kg',
    '‘seventy’kg',
    '‘6’ in',
    '‚6’ in',
    '“6” in',
    '"6" in',
  ])('rejects the quoted number in %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it('does not make a double quotation part of a following inch measurement', () => {
    expect(parseMeasurement('“72” 60 inches')).toBeNull();
  });

  // Preserve the existing adjacent-digit rule. 72 inches is 182.88 cm, not 180 cm, so the
  // two explicit heights conflict under PARSING.md's multiple-measurement rule.
  it('preserves the compact adjacent-digit interpretation of a double mark', () => {
    expect(parseMeasurement('“72”180 cm')).toBeNull();
  });
});
