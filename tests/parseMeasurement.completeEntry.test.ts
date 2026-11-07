import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions } from '../src';

// AFA-250 option A, approved 2026-11-07. Expected values are identity, 12 in/ft,
// 100 cm/m, and complete-number arithmetic. Rejections follow complete-entry consumption.
describe('approved complete-entry contract', () => {
  // Prefix and suffix orientations share the same compound bounds and sign rules.
  it.each([
    'ft five 0',
    'm: one 0',
    'ft five 12 in',
    'm: one 100 cm',
    'ft 5.5 1 in',
    'm: 1.5 1 cm',
    'ft five -1 in',
    'm: one −1 cm',
    'ft five 1 kg',
    'm: one 80 kg',
    'ft five 1 pounds',
    'ft five and and eleven in',
    'ft five and eleven and in',
    'ft five and one half in',
    'ft five one a half in',
    'five-and -a-half kg',
    'five-and- a-half kg',
    'five-and-x-half kg',
    'five-and/a-half kg',
    'five-and--a-half kg',
    '(5 ft junk), 70 kg',
    '180 cm (70 kg junk)',
    '((180 cm) and 70 kg)',
    '(180 cm and (70 kg))',
    '[(180 cm)]',
    '(5 ft) in',
    '(5 ft): 70 kg',
    '(5 ft)=70 kg',
    'twenty zero kg',
    'in: twenty zero',
    '“5\'11"',
    '‘5 ft 11 in',
    '‘5 and eleven in',
  ])('rejects incomplete or ineligible parts in %s for either selector', raw => {
    expect(parseMeasurement(raw)).toBeNull();
    expect(parseMeasurement(raw, { type: 'height' })).toBeNull();
    expect(parseMeasurement(raw, { type: 'weight' })).toBeNull();
  });

  it.each(['(5 ft (11 in))', '[5 ft [11 in]]'])(
    'allows a compound part wrapper inside the single entry wrapper in %s',
    raw => {
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
    }
  );

  it.each(['(5 ft (11 in)), 70 kg', '70 kg, (5 ft (11 in))'])(
    'consumes the entire wrapped compound within a selected pair in %s',
    raw => {
      expect(parseMeasurement(raw, { type: 'height' })).toEqual({
        value: 71,
        unit: 'in',
        type: 'height',
        raw,
        matches: [
          { value: 5, unit: 'ft' },
          { value: 11, unit: 'in' },
        ],
      });
      expect(parseMeasurement(raw, { type: 'weight' })).toEqual({
        value: 70,
        unit: 'kg',
        type: 'weight',
        raw,
        matches: [{ value: 70, unit: 'kg' }],
      });
    }
  );

  it.each(['an hundred kg', 'five-and-a-half kg', 'five and-a-half kg'])(
    'retains an article or an attached number-word hyphen in %s',
    raw => {
      const value = raw === 'an hundred kg' ? 100 : 5.5;
      expect(parseMeasurement(raw)).toEqual({
        value,
        unit: 'kg',
        type: 'weight',
        raw,
        matches: [{ value, unit: 'kg' }],
      });
    }
  );

  it.each([
    [
      'ft five 0 in',
      60,
      'in',
      [
        { value: 5, unit: 'ft' },
        { value: 0, unit: 'in' },
      ],
    ],
    [
      'm: one 0 cm',
      100,
      'cm',
      [
        { value: 1, unit: 'm' },
        { value: 0, unit: 'cm' },
      ],
    ],
    [
      'm: 1 80',
      180,
      'cm',
      [
        { value: 1, unit: 'm' },
        { value: 80, unit: 'cm' },
      ],
    ],
    [
      'm: one 80',
      180,
      'cm',
      [
        { value: 1, unit: 'm' },
        { value: 80, unit: 'cm' },
      ],
    ],
    [
      'ft a hundred five eleven',
      1271,
      'in',
      [
        { value: 105, unit: 'ft' },
        { value: 11, unit: 'in' },
      ],
    ],
  ] as const)('keeps the independently written prefix parts in %s', (raw, value, unit, matches) => {
    expect(parseMeasurement(raw)).toEqual({ value, unit, type: 'height', raw, matches });
  });

  it.each(['around 70 kg', 'approx. 70 kg', "'70 kg'", '"70 kg"'])(
    'accepts the exact finite wrapper in %s',
    raw => {
      expect(parseMeasurement(raw)).toEqual({
        value: 70,
        unit: 'kg',
        type: 'weight',
        raw,
        matches: [{ value: 70, unit: 'kg' }],
      });
    }
  );

  it.each(['"180” cm', "'180’ cm"])('retains a recognized closing numeric quotation in %s', raw => {
    expect(parseMeasurement(raw)).toEqual({
      value: 180,
      unit: 'cm',
      type: 'height',
      raw,
      matches: [{ value: 180, unit: 'cm' }],
    });
  });

  it.each([
    '5 and one half kg',
    'five one a half kg',
    'five and a half and kg',
    '"180’ cm',
    "'180” cm",
    "'180) cm",
    "'one two' ft 11 in",
    'I eat 70 kg',
    'weigh on: 70 kg',
    'weigh-on: 70 kg',
    'weigh in: 180 cm',
    'my height (70 kg)',
    'my weight (180 cm)',
    'height (weight 70 kg)',
    '5 ft (11 in]',
    '5 ft [11 in)',
  ])('rejects the incomplete phrase or mismatched ownership in %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  // A leading decimal point is part of the number, independent of the one final period.
  it.each([
    ['.5 in .', 'in', 'height'],
    ['kg .5 .', 'kg', 'weight'],
  ] as const)('keeps a leading decimal and a final period in %s', (raw, unit, type) => {
    expect(parseMeasurement(raw)).toEqual({
      value: 0.5,
      unit,
      type,
      raw,
      matches: [{ value: 0.5, unit }],
    });
  });

  // One balanced wrapper is permitted; mismatched/nested wrappers and incomplete fixed
  // introductions are not complete expressions, regardless of the selected dimension.
  it.each(['(kg]70', '70 (kg]', '((70 kg)), 180 cm', 'weigh in 180 lbs', 'weigh-in 180 lbs'])(
    'rejects the malformed wrapper or introduction %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
      expect(parseMeasurement(raw, { type: 'height' })).toBeNull();
      expect(parseMeasurement(raw, { type: 'weight' })).toBeNull();
    }
  );

  it.each([
    ['6 ft', 6, 'ft'],
    ['150 lbs', 150, 'lb'],
    ['eighty kilograms', 80, 'kg'],
    ['five foot ten', 70, 'in'],
    ["I'm five foot eleven tall", 71, 'in'],
    ['I’m five foot eleven tall', 71, 'in'],
    ['I am five foot eleven', 71, 'in'],
    ['about 180 cm', 180, 'cm'],
    ['I weigh one hundred fifty pounds', 150, 'lb'],
    ['my height is approximately 180 cm tall.', 180, 'cm'],
    ['my weight = roughly 70 kg', 70, 'kg'],
    ['weight 72,5 kg', 72.5, 'kg'],
    ['Weigh in: 180 lbs', 180, 'lb'],
    ['weigh-in: 180 lbs', 180, 'lb'],
    ['Height (in): 72', 72, 'in'],
    ['m: 1.8', 1.8, 'm'],
    ['in = 72', 72, 'in'],
    ['in. 5', 5, 'in'],
    ['kg=72', 72, 'kg'],
    ['kg 70', 70, 'kg'],
    ['72 (in)', 72, 'in'],
    ['1 m 80 cm', 180, 'cm'],
    ['m: 1 cm: 80', 180, 'cm'],
    ['5 ft and 11 in', 71, 'in'],
    ['6 ft, 1/2 in', 72.5, 'in'],
    ['5 ft (11 in)', 71, 'in'],
    ['0-foot-11', 11, 'in'],
    ['5-foot-0-inches', 60, 'in'],
    ['5\'-11"', 71, 'in'],
    ['5 ft −11 in', 71, 'in'],
    ['one m−80 cm', 180, 'cm'],
    ['“72,5” kg', 72.5, 'kg'],
    ['‘5’ 11”', 71, 'in'],
    ['(180 cm)', 180, 'cm'],
    ['[70 kg]', 70, 'kg'],
    ['(180) cm', 180, 'cm'],
    ['"180 cm"', 180, 'cm'],
    ['1,234,56 kg', 1234.56, 'kg'],
    [',5 kg', 0.5, 'kg'],
    ['5 1/2 ft', 5.5, 'ft'],
    ['5½ ft', 5.5, 'ft'],
    ['one hundred and 50 pounds', 150, 'lb'],
    ['a hundred and sixty pounds', 160, 'lb'],
    ['two and a half thousand pounds', 2500, 'lb'],
    ['pounds: two and a half thousand', 2500, 'lb'],
    ['two and a half hundred thousand pounds', 250000, 'lb'],
    ['one hundred and a half thousand lbs', 100500, 'lb'],
    ['ft 5 11', 71, 'in'],
    ['ft one hundred five eleven', 1271, 'in'],
    ['ft five ten and one', 71, 'in'],
    ['ft five eleven and a half', 71.5, 'in'],
    ['ft two and a half hundred eleven', 3011, 'in'],
    ['one-eighty pounds', 180, 'lb'],
    ['185#', 185, 'lb'],
    ['weight: “180 lbs”', 180, 'lb'],
    ['6 ft (1/2) in', 72.5, 'in'],
    ['5 ft−11', 71, 'in'],
    ['5 ft-11', 71, 'in'],
    ['1 m-80 cm', 180, 'cm'],
    ['5 ft, 11 in', 71, 'in'],
    ['5 ft [11 in]', 71, 'in'],
  ] as const)('reads the complete expression %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit, raw });
  });

  it('retains both written metric zero parts and the smaller unit', () => {
    expect(parseMeasurement('1 m 0 cm')).toEqual({
      value: 100,
      unit: 'cm',
      type: 'height',
      raw: '1 m 0 cm',
      matches: [
        { value: 1, unit: 'm' },
        { value: 0, unit: 'cm' },
      ],
    });
  });

  it.each([',', ';', '/', ' and '])(
    'selects only after validating both expressions joined by %s',
    join => {
      const raw = `5 ft 11 in${join}180 lbs`;
      expect(parseMeasurement(raw)).toBeNull();
      expect(parseMeasurement(raw, { type: 'height' })).toMatchObject({ value: 71, unit: 'in' });
      expect(parseMeasurement(raw, { type: 'weight' })).toMatchObject({ value: 180, unit: 'lb' });
    }
  );

  it.each([
    ['5 ft (10/180 lbs)', { type: 'weight' }, 10 / 180, 'lb'],
    ["5'10/180 lbs", { type: 'height' }, 70, 'in'],
    ["5'10/180 lbs", { type: 'weight' }, 180, 'lb'],
    ['5 ft 11 and 180 lbs', { type: 'height' }, 71, 'in'],
    ['5 ft 11 and 180 lbs', { type: 'weight' }, 180, 'lb'],
    ['5 ft ten and one and two hundred pounds', { type: 'height' }, 71, 'in'],
    ['5 ft ten and one and two hundred pounds', { type: 'weight' }, 200, 'lb'],
    ['(5 ft; 180 lbs)', { type: 'height' }, 5, 'ft'],
    ['[5 ft; 180 lbs]', { type: 'weight' }, 180, 'lb'],
    ['180 cm (180 lbs)', { normalizedUnit: 'kg' }, 180 * 0.45359237, 'kg'],
  ] as const)('reads the selected complete pair %s', (raw, options: ParseOptions, value, unit) => {
    expect(parseMeasurement(raw, options)).toMatchObject({ value, unit });
  });

  it.each([
    "five-'-5.5",
    '.5-′ tall',
    "3/4-'",
    '6-″',
    '5 ft -11 in',
    '5 ft +11 in',
    '5 ft, 11',
    '5 ft (11)',
    '5 ft [11]',
    '1 m, 80',
    '1 m (80)',
    '+70 kg',
    '＋70 kg',
    '“+5” kg',
    '“−5” kg',
    '70kg;',
    '185#kg',
    '70” KG',
    '12 st-4 lb',
    '12 st -4 lb',
    '12 st −4 lb',
    '12 st +4 lb',
    '6 1-2 ft 3 in',
    '6ft1-2in',
    '6 ft 1-2 11 in',
    '50-70 kg, 180 lbs',
    '150 to 180 lbs',
    'between 70 and 80 kg',
    'twelve to thirteen stone',
    '140 and 150 pounds',
    '5 11 inches',
    '20 and 5 pounds',
    'one and two pounds',
    'one hundred and 150 pounds',
    'one hundred and two hundred pounds',
    '5 hundred and 6 hundred pounds',
    'one thousand and two thousand pounds',
    '5 ft 0',
    '5 ft 12',
    '5 ft -11',
    '5 ft 10 and a hat',
    '5 ft and a half-hour walk',
    '1.5 and a half thousand ft 4',
    'and a half thousand pounds',
    'age=28, kg=72',
    '72 in: height',
    'Height (m): 180 cm',
    'kg: 72 kg',
    'kg: 72 lbs',
    '180;lbs',
    'lbs;180',
    'one hundred;fifty pounds',
    'record 0; kg 70',
    '0 feet; actual 1.8 meters',
    '0 kg, 80 lb',
    '0 kg 70',
    '0 ft 0 in, 5 in',
    'invalid -5 ft; actual 180 cm',
    '-5 ft, 150 lbs',
    'kg -6 ft, 70 kg',
    'Top 10 in the class',
    'weighed 70 kg in 2020',
    'I drink 8 oz of water, weight 180 lbs',
    '180 lbs, 8 oz of water a day',
    '5 ft 8 oz 3 in',
    '12;st4lb',
    'Oct 1st, 180 lbs',
    '1,000, kg',
    'height-1,800 cm',
    'phase2,180 cm',
    'twenty,5 kg',
    '1/2/180 lbs',
    '5 ft; 11 in',
    '5 ft actual 11 in',
    '5 ft: 11 in',
    '5 ft 11 in 180 lbs',
    'height 70 kg',
    'I weigh 180 cm',
    '70 kg tall',
    'about around 70 kg',
    '180@lbs',
    'five&feet',
    '72.5!kg',
    '180 cm 🧊',
    '70 kg extra',
    '1.2.3 kg',
    '1,2345 kg',
    '½5 kg',
    '5 kg __',
    '"72',
    "'5",
    "'5 lbs",
    '″ 5',
    '´ one-eighty ” ¾',
    '(70 kg',
    '70 kg)',
    '((70 kg))',
    '-70 kg',
    '−70 kg',
    '﹣70 kg',
    '－70 kg',
    'kg-70.5',
    'weight: −70 kg',
    '1 to 2; hundred lbs',
    '1 to 2; and a half lbs',
    '150 to 180-200 lbs,70kg',
    'between 150 and 180–200 lbs,70kg',
    '5 ft one point twenty in',
  ])('rejects the entire entry %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it.each([
    "5'10/180 to 190 11 in",
    '180 cm, 7 lb 8 oz',
    '180 cm, -70 kg',
    '180 cm, 0 kg',
    "5'10/180-190 lbs",
  ])('does not hide an invalid other expression in %s', raw => {
    expect(parseMeasurement(raw, { type: 'height' })).toBeNull();
  });
});

// Positive counterparts to retired metadata/ownership cases. Both orders and each selector
// must select the same complete component; no invalid other expression may be hidden.
describe('complete-entry selection symmetry', () => {
  const selectors = [
    [{ type: 'height' }, 71, 'in'],
    [{ type: 'weight' }, 180, 'lb'],
    [{ normalizedUnit: 'cm' }, 180.34, 'cm'],
    [{ normalizedUnit: 'kg' }, 81.6466266, 'kg'],
  ] as const;
  it.each(selectors)('selects consistently with %j', (options, value, unit) => {
    expect.hasAssertions();
    for (const raw of ['5 ft 11 in; 180 lbs', '180 lbs; 5 ft 11 in']) {
      expect(parseMeasurement(raw, options)).toMatchObject({
        value: expect.closeTo(value, 10),
        unit,
      });
    }
  });
  it.each(['kg: 70', 'kg=70', '(kg) 70', '[kg]=70', '70 (kg)', 'weight: kg 70'])(
    'retains the simple directional label %s',
    raw => {
      expect(parseMeasurement(raw)).toMatchObject({ value: 70, unit: 'kg' });
      expect(parseMeasurement(`age=28, ${raw}`)).toBeNull();
    }
  );
  it.each(['-70 kg', '0 kg', '70 kg extra', '7 lb 8 oz', '70 to 80 kg'])(
    'rejects invalid other expression %s for both orders and dimensions',
    invalid => {
      expect.hasAssertions();
      for (const raw of [`180 cm; ${invalid}`, `${invalid}; 180 cm`]) {
        for (const [options] of selectors) expect(parseMeasurement(raw, options)).toBeNull();
      }
    }
  );
  it.each(['-180 cm', '0 ft', '180 cm extra', '5 ft 8 oz', '5 to 6 feet'])(
    'rejects invalid height %s beside a valid weight for every selector',
    invalid => {
      expect.hasAssertions();
      for (const raw of [`70 kg; ${invalid}`, `${invalid}; 70 kg`]) {
        for (const [options] of selectors) expect(parseMeasurement(raw, options)).toBeNull();
      }
    }
  );
});

it('checks a complete compound in the requested finite target unit', () => {
  const raw = `1${'0'.repeat(308)} ft 1 in`;
  // 1e308 + 1/12 rounds to 1e308 feet; the inch total would overflow.
  expect(parseMeasurement(raw, { normalizedUnit: 'ft' })).toMatchObject({
    value: 1e308,
    unit: 'ft',
    matches: [
      { value: 1e308, unit: 'ft' },
      { value: 1, unit: 'in' },
    ],
  });
  expect(parseMeasurement(raw)).toBeNull();
});

// Main 70f3169 / #242 late evidence: historical failures remain recorded as unfixed there.
describe('current-main composition controls', () => {
  it.each([
    [
      'one meter eighty, seventy kilograms',
      { type: 'height' },
      {
        value: 180,
        unit: 'cm',
        type: 'height',
        matches: [
          { value: 1, unit: 'm' },
          { value: 80, unit: 'cm' },
        ],
      },
    ],
    [
      'one meter eighty, seventy kilograms',
      { type: 'weight' },
      { value: 70, unit: 'kg', type: 'weight', matches: [{ value: 70, unit: 'kg' }] },
    ],
    [
      'one meter eighty cm, seventy kilograms',
      { type: 'height' },
      {
        value: 180,
        unit: 'cm',
        type: 'height',
        matches: [
          { value: 1, unit: 'm' },
          { value: 80, unit: 'cm' },
        ],
      },
    ],
    [
      '0 meters 80',
      {},
      {
        value: 80,
        unit: 'cm',
        type: 'height',
        matches: [
          { value: 0, unit: 'm' },
          { value: 80, unit: 'cm' },
        ],
      },
    ],
    [
      'one meter eighty',
      {},
      {
        value: 180,
        unit: 'cm',
        type: 'height',
        matches: [
          { value: 1, unit: 'm' },
          { value: 80, unit: 'cm' },
        ],
      },
    ],
  ] as const)('keeps complete selected metric parts in %s', (raw, options, expected) => {
    expect(parseMeasurement(raw, options)).toEqual({ ...expected, raw });
  });
  it.each([
    ['one meter eighty, 5ft11', {}],
    ['1 m 80, 5ft11', {}],
    ['1 m seventy, 5 cm', {}],
    ['0 meters -80, 180 cm', {}],
    ['0 meters −80, 180 cm', {}],
    ['zero meters -eighty, 180 cm', {}],
    ['0 meters -80; actual 180 cm', {}],
    ['0 meters -80 kg, 180 cm', { type: 'height' }],
    ['kg-70.5', {}],
  ] as const)('rejects complete invalid entries from late evidence: %s', (raw, options) => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });
});

describe('current-main connector and metric selector controls', () => {
  it.each([
    [
      'ft: 5, −11 in',
      {},
      {
        value: 71,
        unit: 'in',
        type: 'height',
        matches: [
          { value: 5, unit: 'ft' },
          { value: 11, unit: 'in' },
        ],
      },
    ],
    [
      'ft: 5, ﹣11 in',
      {},
      {
        value: 71,
        unit: 'in',
        type: 'height',
        matches: [
          { value: 5, unit: 'ft' },
          { value: 11, unit: 'in' },
        ],
      },
    ],
    [
      '(m.) 1, −80 cm',
      {},
      {
        value: 180,
        unit: 'cm',
        type: 'height',
        matches: [
          { value: 1, unit: 'm' },
          { value: 80, unit: 'cm' },
        ],
      },
    ],
    [
      '(m.) 1, ﹣80 cm',
      {},
      {
        value: 180,
        unit: 'cm',
        type: 'height',
        matches: [
          { value: 1, unit: 'm' },
          { value: 80, unit: 'cm' },
        ],
      },
    ],
    [
      'one meter eighty, seventy kilograms',
      { type: 'height' },
      {
        value: 180,
        unit: 'cm',
        type: 'height',
        matches: [
          { value: 1, unit: 'm' },
          { value: 80, unit: 'cm' },
        ],
      },
    ],
    [
      'one meter eighty, seventy kilograms',
      { normalizedUnit: 'cm' },
      {
        value: 180,
        unit: 'cm',
        type: 'height',
        matches: [
          { value: 1, unit: 'm' },
          { value: 80, unit: 'cm' },
        ],
      },
    ],
    [
      'one meter eighty, seventy kilograms',
      { type: 'weight' },
      { value: 70, unit: 'kg', type: 'weight', matches: [{ value: 70, unit: 'kg' }] },
    ],
    [
      'one meter eighty, seventy kilograms',
      { normalizedUnit: 'kg' },
      { value: 70, unit: 'kg', type: 'weight', matches: [{ value: 70, unit: 'kg' }] },
    ],
    [
      'seventy kilograms, one meter eighty',
      { type: 'height' },
      {
        value: 180,
        unit: 'cm',
        type: 'height',
        matches: [
          { value: 1, unit: 'm' },
          { value: 80, unit: 'cm' },
        ],
      },
    ],
    [
      'seventy kilograms, one meter eighty',
      { normalizedUnit: 'cm' },
      {
        value: 180,
        unit: 'cm',
        type: 'height',
        matches: [
          { value: 1, unit: 'm' },
          { value: 80, unit: 'cm' },
        ],
      },
    ],
    [
      'seventy kilograms, one meter eighty',
      { type: 'weight' },
      { value: 70, unit: 'kg', type: 'weight', matches: [{ value: 70, unit: 'kg' }] },
    ],
    [
      'seventy kilograms, one meter eighty',
      { normalizedUnit: 'kg' },
      { value: 70, unit: 'kg', type: 'weight', matches: [{ value: 70, unit: 'kg' }] },
    ],
  ] as const)('preserves complete parts for %s with %o', (raw, options, expected) => {
    expect(parseMeasurement(raw, options)).toEqual({ ...expected, raw });
  });
  it.each([
    ['ft: 5, -11 in', {}],
    ['ft: 5, +11 in', {}],
    ['(m.) 1, -80 cm', {}],
    ['(m.) 1, +80 cm', {}],
    ['ft: 5, −11', {}],
    ['(m.) 1, ﹣80', {}],
    ['ft: 5.5, −6 in', {}],
    ['(m.) 1.5, ﹣50 cm', {}],
    ['ft: 5, −12 in', {}],
    ['(m.) 1, ﹣100 cm', {}],
    ['ft: 5, −11 kg', {}],
    ['(m.) 1, ﹣80 kg', {}],
    ['kg: 70, −4 lb', {}],
    ['12 st, −4 lb', {}],
  ] as const)('rejects ineligible joins in %s', (raw, options) => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });
});
