import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions, type ParsedValue } from '../src';

// AFA-250: frozen approved wrapper/pair routes and independent arithmetic.
// AFA-277: quotation marks and brackets cannot surround an entry, a measurement of a pair or a
// number. Each row with such a wrapper expects null.
const cases: [string, ParseOptions, ParsedValue | null][] = [
  [
    '"5\'11", 70 kg"',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5\'11", 70 kg"',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"5\'11", 70 kg"',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '"5\'11", 70 kg"',
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  ['"5\'11", 70 kg"', {}, null],
  [
    '"5′11″, 70 kg"',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5′11″, 70 kg"',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"5′11″, 70 kg"',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '"5′11″, 70 kg"',
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  ['"5′11″, 70 kg"', {}, null],
  [
    '"70 kg, 5\'11""',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"70 kg, 5\'11""',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"70 kg, 5\'11""',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '"70 kg, 5\'11""',
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  ['"70 kg, 5\'11""', {}, null],
  [
    '"5\'11", 70 kg',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5\'11", 70 kg',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"5\'11", 70 kg',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '"5\'11", 70 kg',
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  ['"5\'11", 70 kg', {}, null],
  ['„5 ft 11”', {}, null],
  [
    '„5 ft 11”',
    {
      type: 'height',
    },
    null,
  ],
  [
    '„5 ft 11”',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '„5 ft 11”',
    {
      type: 'weight',
    },
    null,
  ],
  ['”5 ft 11”', {}, null],
  [
    '”5 ft 11”',
    {
      type: 'height',
    },
    null,
  ],
  [
    '”5 ft 11”',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '”5 ft 11”',
    {
      type: 'weight',
    },
    null,
  ],
  ['“5 ft 11”', {}, null],
  [
    '“5 ft 11”',
    {
      type: 'height',
    },
    null,
  ],
  [
    '“5 ft 11”',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '“5 ft 11”',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"72" kg, 180 cm',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"72" kg, 180 cm',
    {
      type: 'height',
    },
    null,
  ],
  [
    '„5 ft 11',
    {
      type: 'height',
    },
    null,
  ],
  [
    '“5 ft 11',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5\'11", 70 kg" extra',
    {
      type: 'height',
    },
    null,
  ],
  ['"5\'11", "70 kg"', {}, null],
  [
    '"5\'11", "70 kg"',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5\'11", "70 kg"',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"5\'11", "70 kg"',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '"5\'11", "70 kg"',
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  ['"5\'11"; 70 kg"', {}, null],
  [
    '"5\'11"; 70 kg"',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5\'11"; 70 kg"',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"5\'11"; 70 kg"',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '"5\'11"; 70 kg"',
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  ['"5\'11"; 70 kg', {}, null],
  [
    '"5\'11"; 70 kg',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5\'11"; 70 kg',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"5\'11"; 70 kg',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '"5\'11"; 70 kg',
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  ['"5\'11"; "70 kg"', {}, null],
  [
    '"5\'11"; "70 kg"',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5\'11"; "70 kg"',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"5\'11"; "70 kg"',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '"5\'11"; "70 kg"',
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  ['"5\'11" / 70 kg"', {}, null],
  [
    '"5\'11" / 70 kg"',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5\'11" / 70 kg"',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"5\'11" / 70 kg"',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '"5\'11" / 70 kg"',
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  ['"5\'11" / 70 kg', {}, null],
  [
    '"5\'11" / 70 kg',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5\'11" / 70 kg',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"5\'11" / 70 kg',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '"5\'11" / 70 kg',
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  ['"5\'11" / "70 kg"', {}, null],
  [
    '"5\'11" / "70 kg"',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5\'11" / "70 kg"',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"5\'11" / "70 kg"',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '"5\'11" / "70 kg"',
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  ['"5\'11" and 70 kg"', {}, null],
  [
    '"5\'11" and 70 kg"',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5\'11" and 70 kg"',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"5\'11" and 70 kg"',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '"5\'11" and 70 kg"',
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  ['"5\'11" and 70 kg', {}, null],
  [
    '"5\'11" and 70 kg',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5\'11" and 70 kg',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"5\'11" and 70 kg',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '"5\'11" and 70 kg',
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  ['"5\'11" and "70 kg"', {}, null],
  [
    '"5\'11" and "70 kg"',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5\'11" and "70 kg"',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"5\'11" and "70 kg"',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '"5\'11" and "70 kg"',
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  ['"5\'11" (70 kg)"', {}, null],
  [
    '"5\'11" (70 kg)"',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5\'11" (70 kg)"',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"5\'11" (70 kg)"',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '"5\'11" (70 kg)"',
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  ['"5\'11" (70 kg)', {}, null],
  [
    '"5\'11" (70 kg)',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5\'11" (70 kg)',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"5\'11" (70 kg)',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '"5\'11" (70 kg)',
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  ['"5\'11" [70 kg]"', {}, null],
  [
    '"5\'11" [70 kg]"',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5\'11" [70 kg]"',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"5\'11" [70 kg]"',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '"5\'11" [70 kg]"',
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  ['"5\'11" [70 kg]', {}, null],
  [
    '"5\'11" [70 kg]',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5\'11" [70 kg]',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"5\'11" [70 kg]',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '"5\'11" [70 kg]',
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  ['"72", 70 kg"', {}, null],
  [
    '"72", 70 kg"',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"72", 70 kg"',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"72", 70 kg"',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '"72", 70 kg"',
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  ['"72" kg, 180 cm', {}, null],
  [
    '"72" kg, 180 cm',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '"72" kg, 180 cm',
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  ['"72" kg; 180 cm', {}, null],
  [
    '"72" kg; 180 cm',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"72" kg; 180 cm',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"72" kg; 180 cm',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '"72" kg; 180 cm',
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  ['"5\'11", 70 kg".', {}, null],
  [
    '"5\'11", 70 kg".',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5\'11", 70 kg".',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"5\'11", 70 kg".',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '"5\'11", 70 kg".',
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  ['"5\'11"; 70 kg".', {}, null],
  [
    '"5\'11"; 70 kg".',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5\'11"; 70 kg".',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"5\'11"; 70 kg".',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '"5\'11"; 70 kg".',
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  ['"5\'11" and 70 kg".', {}, null],
  [
    '"5\'11" and 70 kg".',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5\'11" and 70 kg".',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"5\'11" and 70 kg".',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '"5\'11" and 70 kg".',
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  ['„1 m 80”', {}, null],
  [
    '„1 m 80”',
    {
      type: 'height',
    },
    null,
  ],
  [
    '„1 m 80”',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '„1 m 80”',
    {
      type: 'weight',
    },
    null,
  ],
  ['„72” kg', {}, null],
  ['„72” in', {}, null],
  ['about „5 ft 11” tall.', {}, null],
  ['”1 m 80”', {}, null],
  [
    '”1 m 80”',
    {
      type: 'height',
    },
    null,
  ],
  [
    '”1 m 80”',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '”1 m 80”',
    {
      type: 'weight',
    },
    null,
  ],
  ['”72” kg', {}, null],
  ['”72” in', {}, null],
  ['about ”5 ft 11” tall.', {}, null],
  ['“1 m 80”', {}, null],
  [
    '“1 m 80”',
    {
      type: 'height',
    },
    null,
  ],
  [
    '“1 m 80”',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '“1 m 80”',
    {
      type: 'weight',
    },
    null,
  ],
  ['“72” kg', {}, null],
  ['“72” in', {}, null],
  ['about “5 ft 11” tall.', {}, null],
  ['‚5 ft 11’', {}, null],
  [
    '‚5 ft 11’',
    {
      type: 'height',
    },
    null,
  ],
  [
    '‚5 ft 11’',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '‚5 ft 11’',
    {
      type: 'weight',
    },
    null,
  ],
  ['‚1 m 80’', {}, null],
  [
    '‚1 m 80’',
    {
      type: 'height',
    },
    null,
  ],
  [
    '‚1 m 80’',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '‚1 m 80’',
    {
      type: 'weight',
    },
    null,
  ],
  ['‚72’ kg', {}, null],
  ['‚72’ in', {}, null],
  ['about ‚5 ft 11’ tall.', {}, null],
  ['‘5 ft 11’', {}, null],
  [
    '‘5 ft 11’',
    {
      type: 'height',
    },
    null,
  ],
  [
    '‘5 ft 11’',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '‘5 ft 11’',
    {
      type: 'weight',
    },
    null,
  ],
  ['‘1 m 80’', {}, null],
  [
    '‘1 m 80’',
    {
      type: 'height',
    },
    null,
  ],
  [
    '‘1 m 80’',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '‘1 m 80’',
    {
      type: 'weight',
    },
    null,
  ],
  ['‘72’ kg', {}, null],
  ['‘72’ in', {}, null],
  ['about ‘5 ft 11’ tall.', {}, null],
  [
    '5”',
    {},
    {
      value: 5,
      unit: 'in',
      type: 'height',
      raw: '5”',
      matches: [
        {
          value: 5,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '5′11″',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '5′11″',
      matches: [
        {
          value: 5,
          unit: 'ft',
        },
        {
          value: 11,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '5’11”',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '5’11”',
      matches: [
        {
          value: 5,
          unit: 'ft',
        },
        {
          value: 11,
          unit: 'in',
        },
      ],
    },
  ],
  ['‘5’ 11″', {}, null],
  [
    '"5\'11", -70 kg"',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5\'11", -70 kg"',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"5\'11", 70 g"',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5\'11", 70 g"',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"5\'11", 180 cm"',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5\'11", 180 cm"',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"5\'11", 70 kg, 80 lb"',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5\'11", 70 kg, 80 lb"',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"5\'11",, 70 kg"',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5\'11",, 70 kg"',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"5\'11" and and 70 kg"',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5\'11" and and 70 kg"',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"5\'11", 70 kg" extra',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"5\'11", "70 kg""',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5\'11", "70 kg""',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"5\'11" ((70 kg))"',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5\'11" ((70 kg))"',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"5\'11" [70 kg)"',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5\'11" [70 kg)"',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"5\'11" (70 kg]"',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5\'11" (70 kg]"',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"5\'11" (70 kg)""',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5\'11" (70 kg)""',
    {
      type: 'weight',
    },
    null,
  ],
  [
    'about "5\'11", 70 kg"',
    {
      type: 'height',
    },
    null,
  ],
  [
    'about "5\'11", 70 kg"',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '”5 ft 11',
    {
      type: 'height',
    },
    null,
  ],
  [
    '‚5 ft 11',
    {
      type: 'height',
    },
    null,
  ],
  [
    '„5 ft 11’',
    {
      type: 'height',
    },
    null,
  ],
  [
    '‚5 ft 11”',
    {
      type: 'height',
    },
    null,
  ],
  [
    '„„5 ft 11””',
    {
      type: 'height',
    },
    null,
  ],
  [
    '‚‚5 ft 11’’',
    {
      type: 'height',
    },
    null,
  ],
  [
    '„5 ft 11” extra',
    {
      type: 'height',
    },
    null,
  ],
  [
    '„70 kg” tall',
    {
      type: 'height',
    },
    null,
  ],
  [
    '„5 ft 11” tall tall',
    {
      type: 'height',
    },
    null,
  ],
  [
    '„5 ft 11”..',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5\'11" (70 kg"',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5\'11" (70 kg"',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"5\'11" [70 kg"',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5\'11" [70 kg"',
    {
      type: 'weight',
    },
    null,
  ],
  ['72” or 70”', {}, null],
  ['72 ” or 70 ”', {}, null],
  ['seventy” or eighty”', {}, null],
  ['six and a half ” or seven ”', {}, null],
  ['5½” or 6¼”', {}, null],
  ['72” and ”70” kg', {}, null],
  [
    '72” and ”70” kg',
    {
      type: 'height',
    },
    null,
  ],
  [
    '72” and ”70” kg',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '72” and ”70” kg',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '72” and ”70” kg',
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  ['“72” or 70”', {}, null],
  ['”72” or 70”', {}, null],
  // An unquoted unit mark plus a second named unit is not one complete scalar.
  ['72’ kg', {}, null],
  ['5½’ ft', {}, null],
];

describe('complete entry fifth review', () => {
  it.each(cases)('reads %s with %j', (raw, options, expected) => {
    expect(parseMeasurement(raw, options)).toEqual(expected);
  });
});
