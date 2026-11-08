import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions, type ParsedValue } from '../src';

// AFA-265: PARSING permits the same finite wrappers, spacing, compact spelling and selectors.
// Independent arithmetic: 5 * 12 + 11 = 71 in; 71 * 2.54 = 180.34 cm; 5 * 12 + 10 = 70 in.
const cases: [string, ParseOptions, number, ParsedValue['unit'], ParsedValue['matches']][] = [
  [
    '“5’11””',
    {},
    71,
    'in',
    [
      {
        value: 5,
        unit: 'ft',
      },
      {
        value: 11,
        unit: 'in',
      },
    ],
  ],
  [
    '„5’11””',
    {},
    71,
    'in',
    [
      {
        value: 5,
        unit: 'ft',
      },
      {
        value: 11,
        unit: 'in',
      },
    ],
  ],
  [
    '”5’11””',
    {},
    71,
    'in',
    [
      {
        value: 5,
        unit: 'ft',
      },
      {
        value: 11,
        unit: 'in',
      },
    ],
  ],
  [
    '‘5’11’’’',
    {},
    71,
    'in',
    [
      {
        value: 5,
        unit: 'ft',
      },
      {
        value: 11,
        unit: 'in',
      },
    ],
  ],
  [
    '‚six’’',
    {},
    6,
    'ft',
    [
      {
        value: 6,
        unit: 'ft',
      },
    ],
  ],
  [
    '„72””',
    {},
    72,
    'in',
    [
      {
        value: 72,
        unit: 'in',
      },
    ],
  ],
  [
    '“five’ ten””',
    {},
    70,
    'in',
    [
      {
        value: 5,
        unit: 'ft',
      },
      {
        value: 10,
        unit: 'in',
      },
    ],
  ],
  [
    '“5’11” ”',
    {},
    71,
    'in',
    [
      {
        value: 5,
        unit: 'ft',
      },
      {
        value: 11,
        unit: 'in',
      },
    ],
  ],
  [
    '“5’11”  ”',
    {},
    71,
    'in',
    [
      {
        value: 5,
        unit: 'ft',
      },
      {
        value: 11,
        unit: 'in',
      },
    ],
  ],
  [
    '“72” ”',
    {},
    72,
    'in',
    [
      {
        value: 72,
        unit: 'in',
      },
    ],
  ],
  [
    '“72””',
    {},
    72,
    'in',
    [
      {
        value: 72,
        unit: 'in',
      },
    ],
  ],
  [
    '“5’11”” tall',
    {},
    71,
    'in',
    [
      {
        value: 5,
        unit: 'ft',
      },
      {
        value: 11,
        unit: 'in',
      },
    ],
  ],
  [
    '“5’11””.',
    {},
    71,
    'in',
    [
      {
        value: 5,
        unit: 'ft',
      },
      {
        value: 11,
        unit: 'in',
      },
    ],
  ],
  [
    '“5 ft 11””',
    {},
    71,
    'in',
    [
      {
        value: 5,
        unit: 'ft',
      },
      {
        value: 11,
        unit: 'in',
      },
    ],
  ],
  [
    '“5ft 11””',
    {},
    71,
    'in',
    [
      {
        value: 5,
        unit: 'ft',
      },
      {
        value: 11,
        unit: 'in',
      },
    ],
  ],
  [
    '“5’11”” ',
    {},
    71,
    'in',
    [
      {
        value: 5,
        unit: 'ft',
      },
      {
        value: 11,
        unit: 'in',
      },
    ],
  ],
  [
    '“ 5’11” ”',
    {},
    71,
    'in',
    [
      {
        value: 5,
        unit: 'ft',
      },
      {
        value: 11,
        unit: 'in',
      },
    ],
  ],
  [
    'about “5’11””',
    {},
    71,
    'in',
    [
      {
        value: 5,
        unit: 'ft',
      },
      {
        value: 11,
        unit: 'in',
      },
    ],
  ],
  [
    '“about 5’11””',
    {},
    71,
    'in',
    [
      {
        value: 5,
        unit: 'ft',
      },
      {
        value: 11,
        unit: 'in',
      },
    ],
  ],
  [
    '“5’11””, 70 kg',
    {
      type: 'height',
    },
    71,
    'in',
    [
      {
        value: 5,
        unit: 'ft',
      },
      {
        value: 11,
        unit: 'in',
      },
    ],
  ],
  [
    '“5’11””',
    {
      normalizedUnit: 'cm',
    },
    180.34,
    'cm',
    [
      {
        value: 5,
        unit: 'ft',
      },
      {
        value: 11,
        unit: 'in',
      },
    ],
  ],
  [
    '“1””',
    {},
    1,
    'in',
    [
      {
        value: 1,
        unit: 'in',
      },
    ],
  ],
];

describe('curly unit and entry close with finite wrappers', () => {
  it.each(cases)('reads %s with %j', (raw, options, value, unit, matches) => {
    expect(parseMeasurement(raw, options)).toEqual({ value, unit, type: 'height', raw, matches });
  });
});
