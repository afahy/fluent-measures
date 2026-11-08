import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions, type ParsedValue } from '../src';

// AFA-265: ticket arithmetic and one balanced entry wrapper; raw and written parts stay truthful.
const cases: [string, ParseOptions, ParsedValue | null][] = [
  [
    '“5’11””',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '“5’11””',
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
    '„5’11””',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '„5’11””',
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
    '”5’11””',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '”5’11””',
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
    '“5’11””',
    {
      type: 'height',
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '“5’11””',
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
    '„5’11””',
    {
      type: 'height',
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '„5’11””',
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
    '”5’11””',
    {
      type: 'height',
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '”5’11””',
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
    '“5’ 11””',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '“5’ 11””',
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
    '„5’ 11””',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '„5’ 11””',
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
    '”5’ 11””',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '”5’ 11””',
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
    '“5 ’11””',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '“5 ’11””',
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
    '„5 ’11””',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '„5 ’11””',
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
    '”5 ’11””',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '”5 ’11””',
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
    '“5 ’ 11””',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '“5 ’ 11””',
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
    '„5 ’ 11””',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '„5 ’ 11””',
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
    '”5 ’ 11””',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '”5 ’ 11””',
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
    '“five’10””',
    {},
    {
      value: 70,
      unit: 'in',
      type: 'height',
      raw: '“five’10””',
      matches: [
        {
          value: 5,
          unit: 'ft',
        },
        {
          value: 10,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '„five’10””',
    {},
    {
      value: 70,
      unit: 'in',
      type: 'height',
      raw: '„five’10””',
      matches: [
        {
          value: 5,
          unit: 'ft',
        },
        {
          value: 10,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '”five’10””',
    {},
    {
      value: 70,
      unit: 'in',
      type: 'height',
      raw: '”five’10””',
      matches: [
        {
          value: 5,
          unit: 'ft',
        },
        {
          value: 10,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '“five’ ten””',
    {},
    {
      value: 70,
      unit: 'in',
      type: 'height',
      raw: '“five’ ten””',
      matches: [
        {
          value: 5,
          unit: 'ft',
        },
        {
          value: 10,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '„five’ ten””',
    {},
    {
      value: 70,
      unit: 'in',
      type: 'height',
      raw: '„five’ ten””',
      matches: [
        {
          value: 5,
          unit: 'ft',
        },
        {
          value: 10,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '”five’ ten””',
    {},
    {
      value: 70,
      unit: 'in',
      type: 'height',
      raw: '”five’ ten””',
      matches: [
        {
          value: 5,
          unit: 'ft',
        },
        {
          value: 10,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '„72””',
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: '„72””',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '”72””',
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: '”72””',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '„5””',
    {},
    {
      value: 5,
      unit: 'in',
      type: 'height',
      raw: '„5””',
      matches: [
        {
          value: 5,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '”5””',
    {},
    {
      value: 5,
      unit: 'in',
      type: 'height',
      raw: '”5””',
      matches: [
        {
          value: 5,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '‘5’11’’’',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '‘5’11’’’',
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
    '‚5’11’’’',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '‚5’11’’’',
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
    '‚six’’',
    {},
    {
      value: 6,
      unit: 'ft',
      type: 'height',
      raw: '‚six’’',
      matches: [
        {
          value: 6,
          unit: 'ft',
        },
      ],
    },
  ],
  [
    '„5 ft 11”',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '„5 ft 11”',
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
    '„5 ft 11”',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '„5 ft 11”',
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
    '”5 ft 11”',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '”5 ft 11”',
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
    '”5 ft 11”',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '”5 ft 11”',
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
    '“5’11”',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '“5’11”',
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
    '“5’11”',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '“5’11”',
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
    '“5′11″”',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '“5′11″”',
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
    '“5′11″”',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '“5′11″”',
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
    '"5\'11""',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5\'11""',
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
    '"5\'11""',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '"5\'11""',
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
    '(5\'11")',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '(5\'11")',
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
    '(5\'11")',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '(5\'11")',
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
    '[5’11”]',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '[5’11”]',
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
    '[5’11”]',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '[5’11”]',
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
    '"5\'11", 70 kg"',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5\'11", 70 kg"',
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
    '"5\'11", 70 kg"',
    {
      type: 'weight',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11", 70 kg"',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  ['"5\'11", 70 kg"', {}, null],
  [
    '"5\'11", 70 kg',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5\'11", 70 kg',
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
    '"5\'11", 70 kg',
    {
      type: 'weight',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11", 70 kg',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  ['"5\'11", 70 kg', {}, null],
  [
    '‘72’ kg',
    {},
    {
      value: 72,
      unit: 'kg',
      type: 'weight',
      raw: '‘72’ kg',
      matches: [
        {
          value: 72,
          unit: 'kg',
        },
      ],
    },
  ],
  ['““5 ft 11””', {}, null],
  ['„„5 ft 11””', {}, null],
  ['5 ft 11””', {}, null],
  ['72’ kg', {}, null],
  ['5½’ ft', {}, null],
  ['“72” or 70”', {}, null],
  ['”72” or 70”', {}, null],
  ['““72””', {}, null],
  ['„„72””', {}, null],
  ['‘‚six’’', {}, null],
  ['“5’11”””', {}, null],
  ['„72”””', {}, null],
  ['‘5’11’’’’', {}, null],
  ['“5’11”” extra', {}, null],
  ['“5’11”” 70kg', {}, null],
  ['“5’11”’', {}, null],
  ['‚six’”', {}, null],
  [
    '“72””',
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: '“72””',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '‘six’’',
    {},
    {
      value: 6,
      unit: 'ft',
      type: 'height',
      raw: '‘six’’',
      matches: [
        {
          value: 6,
          unit: 'ft',
        },
      ],
    },
  ],
  [
    '“5 ft 11””',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '“5 ft 11””',
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
    '“5’11” ”',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '“5’11” ”',
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
    '‚six’ ’',
    {},
    {
      value: 6,
      unit: 'ft',
      type: 'height',
      raw: '‚six’ ’',
      matches: [
        {
          value: 6,
          unit: 'ft',
        },
      ],
    },
  ],
];

describe('curly unit before a matching entry close', () => {
  it.each(cases)('reads %s with %j', (raw, options, expected) => {
    expect(parseMeasurement(raw, options)).toEqual(expected);
  });
});
