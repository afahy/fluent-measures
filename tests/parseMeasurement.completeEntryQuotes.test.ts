import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions, type ParsedValue } from '../src';

// AFA-250: independently frozen balanced-wrapper/unit rules and hand arithmetic.
const cases: [string, ParseOptions, ParsedValue | null][] = [
  [
    '"5′11″"',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5′11″"',
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
    '"5′11″"',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5′11″"',
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
    '"5′11″"',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '"5′11″"',
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
      type: 'height',
    },
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
    'about "5′11″"',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: 'about "5′11″"',
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
    'about "5′11″"',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: 'about "5′11″"',
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
    'about "5′11″"',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: 'about "5′11″"',
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
    '"5 ft 11"',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5 ft 11"',
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
    '"5 ft 11 in"',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5 ft 11 in"',
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
    '5\'11"',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '5\'11"',
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
    'about “5′11″”',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: 'about “5′11″”',
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
  ['"5′11″" extra', {}, null],
  ['"5′11″")', {}, null],
  ['"5′11″', {}, null],
  ['about "5′11″', {}, null],
  [
    '"5\'11"',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5\'11"',
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
    '"5\'11"',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5\'11"',
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
    '"5\'11"',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '"5\'11"',
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
    '"5′11"',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5′11"',
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
    '"5′11"',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5′11"',
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
    '"5′11"',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '"5′11"',
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
    '"5ʹ11ʺ"',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5ʹ11ʺ"',
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
    '"5ʹ11ʺ"',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5ʹ11ʺ"',
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
    '"5ʹ11ʺ"',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '"5ʹ11ʺ"',
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
    '"5 ′ 11 ″"',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5 ′ 11 ″"',
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
    '"5 ′ 11 ″"',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5 ′ 11 ″"',
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
    '"5 ′ 11 ″"',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '"5 ′ 11 ″"',
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
    'about "5\'11""',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: 'about "5\'11""',
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
    'about "5\'11""',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: 'about "5\'11""',
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
    'about "5\'11""',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: 'about "5\'11""',
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
    '"five ft eleven""',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"five ft eleven""',
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
    '"five ft eleven""',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"five ft eleven""',
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
    '"five ft eleven""',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '"five ft eleven""',
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
    '"five′eleven″"',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"five′eleven″"',
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
    '"five′eleven″"',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"five′eleven″"',
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
    '"five′eleven″"',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '"five′eleven″"',
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
    '"ft five eleven"',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"ft five eleven"',
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
    '"ft five eleven"',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"ft five eleven"',
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
    '"ft five eleven"',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '"ft five eleven"',
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
      type: 'height',
    },
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
    'about “5′11″”',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: 'about “5′11″”',
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
    'about “5′11″”',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: 'about “5′11″”',
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
    "'5′11″'",
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: "'5′11″'",
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
    "'5′11″'",
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: "'5′11″'",
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
    "'5′11″'",
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: "'5′11″'",
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
    '“5\'11"”',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '“5\'11"”',
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
    '“5\'11"”',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '“5\'11"”',
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
    '“5\'11"”',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '“5\'11"”',
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
    '‘5’ 11″',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '‘5’ 11″',
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
    '‘5’ 11″',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '‘5’ 11″',
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
    '‘5’ 11″',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '‘5’ 11″',
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
    '‘5’ 11ʺ',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '‘5’ 11ʺ',
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
    '‘5’ 11ʺ',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '‘5’ 11ʺ',
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
    '‘5’ 11ʺ',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '‘5’ 11ʺ',
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
    '‘five’ eleven″',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '‘five’ eleven″',
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
    '‘five’ eleven″',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '‘five’ eleven″',
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
    '‘five’ eleven″',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '‘five’ eleven″',
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
    '‘5’ ½″',
    {},
    {
      value: 60.5,
      unit: 'in',
      type: 'height',
      raw: '‘5’ ½″',
      matches: [
        {
          value: 5,
          unit: 'ft',
        },
        {
          value: 0.5,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '‘5’ ½″',
    {
      type: 'height',
    },
    {
      value: 60.5,
      unit: 'in',
      type: 'height',
      raw: '‘5’ ½″',
      matches: [
        {
          value: 5,
          unit: 'ft',
        },
        {
          value: 0.5,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '‘5’ ½″',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 153.67000000000002,
      unit: 'cm',
      type: 'height',
      raw: '‘5’ ½″',
      matches: [
        {
          value: 5,
          unit: 'ft',
        },
        {
          value: 0.5,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '"5′11″" tall',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5′11″" tall',
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
    '"5\'11"" tall',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5\'11"" tall',
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
    '"5′11″".',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5′11″".',
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
    'about "5′11″" tall.',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: 'about "5′11″" tall.',
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
    'height is "5′11″" tall .',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: 'height is "5′11″" tall .',
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
    '"5′11″ tall"',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5′11″ tall"',
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
    '"5\'11"" tall .',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5\'11"" tall .',
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
    '"0′11″"',
    {},
    {
      value: 11,
      unit: 'in',
      type: 'height',
      raw: '"0′11″"',
      matches: [
        {
          value: 0,
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
    '"5′0″"',
    {},
    {
      value: 60,
      unit: 'in',
      type: 'height',
      raw: '"5′0″"',
      matches: [
        {
          value: 5,
          unit: 'ft',
        },
        {
          value: 0,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '"5′11.5″"',
    {},
    {
      value: 71.5,
      unit: 'in',
      type: 'height',
      raw: '"5′11.5″"',
      matches: [
        {
          value: 5,
          unit: 'ft',
        },
        {
          value: 11.5,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '"5′11½″"',
    {},
    {
      value: 71.5,
      unit: 'in',
      type: 'height',
      raw: '"5′11½″"',
      matches: [
        {
          value: 5,
          unit: 'ft',
        },
        {
          value: 11.5,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '"5′ 10 and a half″"',
    {},
    {
      value: 70.5,
      unit: 'in',
      type: 'height',
      raw: '"5′ 10 and a half″"',
      matches: [
        {
          value: 5,
          unit: 'ft',
        },
        {
          value: 10.5,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '"5′ 10 1/2″"',
    {},
    {
      value: 70.5,
      unit: 'in',
      type: 'height',
      raw: '"5′ 10 1/2″"',
      matches: [
        {
          value: 5,
          unit: 'ft',
        },
        {
          value: 10.5,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '"6 ft, 1/2″"',
    {},
    {
      value: 72.5,
      unit: 'in',
      type: 'height',
      raw: '"6 ft, 1/2″"',
      matches: [
        {
          value: 6,
          unit: 'ft',
        },
        {
          value: 0.5,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '"72″"',
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: '"72″"',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '"72""',
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: '"72""',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '72″',
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: '72″',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '72ʺ',
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: '72ʺ',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '"72" in',
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: '"72" in',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '“72” in',
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: '“72” in',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '"72" kg',
    {},
    {
      value: 72,
      unit: 'kg',
      type: 'weight',
      raw: '"72" kg',
      matches: [
        {
          value: 72,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    '"kg 72"',
    {},
    {
      value: 72,
      unit: 'kg',
      type: 'weight',
      raw: '"kg 72"',
      matches: [
        {
          value: 72,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    '"72.5" kg',
    {},
    {
      value: 72.5,
      unit: 'kg',
      type: 'weight',
      raw: '"72.5" kg',
      matches: [
        {
          value: 72.5,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    '″:72',
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: '″:72',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    'ʺ=72',
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: 'ʺ=72',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '(″) 72',
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: '(″) 72',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '[ʺ]:72',
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: '[ʺ]:72',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  ['"5′11″", 70 kg', {}, null],
  [
    '"5′11″", 70 kg',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5′11″", 70 kg',
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
    '"5′11″", 70 kg',
    {
      type: 'weight',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5′11″", 70 kg',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    '"5′11″", 70 kg',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '"5′11″", 70 kg',
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
    '"5′11″", 70 kg',
    {
      normalizedUnit: 'kg',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5′11″", 70 kg',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  ['70 kg and "5′11″"', {}, null],
  [
    '70 kg and "5′11″"',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '70 kg and "5′11″"',
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
    '70 kg and "5′11″"',
    {
      type: 'weight',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '70 kg and "5′11″"',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    '70 kg and "5′11″"',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '70 kg and "5′11″"',
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
    '70 kg and "5′11″"',
    {
      normalizedUnit: 'kg',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '70 kg and "5′11″"',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  ['about "5′11″" and weight 70 kg', {}, null],
  [
    'about "5′11″" and weight 70 kg',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: 'about "5′11″" and weight 70 kg',
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
    'about "5′11″" and weight 70 kg',
    {
      type: 'weight',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: 'about "5′11″" and weight 70 kg',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    'about "5′11″" and weight 70 kg',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: 'about "5′11″" and weight 70 kg',
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
    'about "5′11″" and weight 70 kg',
    {
      normalizedUnit: 'kg',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: 'about "5′11″" and weight 70 kg',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  ['"5\'11"", "70 kg"', {}, null],
  [
    '"5\'11"", "70 kg"',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5\'11"", "70 kg"',
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
    '"5\'11"", "70 kg"',
    {
      type: 'weight',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11"", "70 kg"',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    '"5\'11"", "70 kg"',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '"5\'11"", "70 kg"',
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
    '"5\'11"", "70 kg"',
    {
      normalizedUnit: 'kg',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11"", "70 kg"',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  ['"5′11″, 70 kg"', {}, null],
  [
    '"5′11″, 70 kg"',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5′11″, 70 kg"',
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
    '"5′11″, 70 kg"',
    {
      type: 'weight',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5′11″, 70 kg"',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    '"5′11″, 70 kg"',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '"5′11″, 70 kg"',
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
    '"5′11″, 70 kg"',
    {
      normalizedUnit: 'kg',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5′11″, 70 kg"',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  ['"5ʹ11ʺ', {}, null],
  ['"5′11″”', {}, null],
  ['“5′11″"', {}, null],
  ['"72″', {}, null],
  ['about "72″', {}, null],
  ['"5′11″]', {}, null],
  ['[5′11″"', {}, null],
  ['about "5′11″, 70 kg', {}, null],
  ['"5′11″""', {}, null],
  ['"5\'11"""', {}, null],
  ['("5′11″")', {}, null],
  ['"(5′11″)"', {}, null],
  ['about "about 5′11″"', {}, null],
  ['"5′11″" 72', {}, null],
  ['"5′11″" in', {}, null],
  ['"72″" kg', {}, null],
  ['"5′11″" tall tall', {}, null],
  ['"5′11″" tall. .', {}, null],
  ['"5′11″.".', {}, null],
  ['"5′11″"..', {}, null],
  ['"5′0"', {}, null],
  ['"5′12″"', {}, null],
  ['"5.5′6″"', {}, null],
  ['"5′+11″"', {}, null],
  ['"−5′11″"', {}, null],
  [
    '"5′-11″"',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5′-11″"',
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
  ['"5′eleven and″"', {}, null],
  ['"5′eleven and and one″"', {}, null],
  ['″72', {}, null],
  ['ʺ72', {}, null],
  ['″ seventy two', {}, null],
  ['"72"', {}, null],
  ['“72”', {}, null],
  ['0″1/2 kg', {}, null],
  ['72″1/2 kg', {}, null],
  ['72ʺ1⁄2 kg', {}, null],
  ['"5′11″/70 kg"', {}, null],
  ['"70 kg" tall', {}, null],
  ['"kg 72" tall.', {}, null],
  [
    "'5'11\"'",
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: "'5'11\"'",
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
  ["'5′11″", {}, null],
  ["'5'11", {}, null],
  [
    "'5' eleven in'",
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: "'5' eleven in'",
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
  ["'5'11″' extra", {}, null],
  ["'5'11″''", {}, null],
  [
    "'5'-11″'",
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: "'5'-11″'",
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
    "'5' kg",
    {},
    {
      value: 5,
      unit: 'kg',
      type: 'weight',
      raw: "'5' kg",
      matches: [
        {
          value: 5,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    "'5' in",
    {},
    {
      value: 5,
      unit: 'in',
      type: 'height',
      raw: "'5' in",
      matches: [
        {
          value: 5,
          unit: 'in',
        },
      ],
    },
  ],
  ["'5'", {}, null],
  ["'5' 11", {}, null],
  ["'5' 70 kg", {}, null],
  ["'5' 11 in", {}, null],
  ["'5′11′", {}, null],
  ["about '5′11′", {}, null],
  [
    '′:5',
    {},
    {
      value: 5,
      unit: 'ft',
      type: 'height',
      raw: '′:5',
      matches: [
        {
          value: 5,
          unit: 'ft',
        },
      ],
    },
  ],
  [
    '(′)5',
    {},
    {
      value: 5,
      unit: 'ft',
      type: 'height',
      raw: '(′)5',
      matches: [
        {
          value: 5,
          unit: 'ft',
        },
      ],
    },
  ],
  ['′5', {}, null],
  ['ʹ5', {}, null],
  ['´5', {}, null],
  ["'5´11´", {}, null],
  ["'5ʹ11ʹ", {}, null],
  [
    '72′′',
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: '72′′',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '72´´',
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: '72´´',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '72′’',
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: '72′’',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '72’′',
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: '72’′',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  ['′′5', {}, null],
  ['72′′′', {}, null],
  [
    '5′',
    {},
    {
      value: 5,
      unit: 'ft',
      type: 'height',
      raw: '5′',
      matches: [
        {
          value: 5,
          unit: 'ft',
        },
      ],
    },
  ],
  [
    '5ʹ',
    {},
    {
      value: 5,
      unit: 'ft',
      type: 'height',
      raw: '5ʹ',
      matches: [
        {
          value: 5,
          unit: 'ft',
        },
      ],
    },
  ],
  [
    '5´',
    {},
    {
      value: 5,
      unit: 'ft',
      type: 'height',
      raw: '5´',
      matches: [
        {
          value: 5,
          unit: 'ft',
        },
      ],
    },
  ],
  [
    '"5´11´´"',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5´11´´"',
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
    "'5´11´´'",
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: "'5´11´´'",
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
    '‘5′11″',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '‘5′11″',
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
    '‘5ʹ 11ʺ',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '‘5ʹ 11ʺ',
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
    "'180 cm'.",
    {},
    {
      value: 180,
      unit: 'cm',
      type: 'height',
      raw: "'180 cm'.",
      matches: [
        {
          value: 180,
          unit: 'cm',
        },
      ],
    },
  ],
  [
    "'72 kg'.",
    {},
    {
      value: 72,
      unit: 'kg',
      type: 'weight',
      raw: "'72 kg'.",
      matches: [
        {
          value: 72,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    "'6′'",
    {},
    {
      value: 6,
      unit: 'ft',
      type: 'height',
      raw: "'6′'",
      matches: [
        {
          value: 6,
          unit: 'ft',
        },
      ],
    },
  ],
  [
    "'6´'",
    {},
    {
      value: 6,
      unit: 'ft',
      type: 'height',
      raw: "'6´'",
      matches: [
        {
          value: 6,
          unit: 'ft',
        },
      ],
    },
  ],
  [
    "'6ʹ'",
    {},
    {
      value: 6,
      unit: 'ft',
      type: 'height',
      raw: "'6ʹ'",
      matches: [
        {
          value: 6,
          unit: 'ft',
        },
      ],
    },
  ],
  [
    '"6′"',
    {},
    {
      value: 6,
      unit: 'ft',
      type: 'height',
      raw: '"6′"',
      matches: [
        {
          value: 6,
          unit: 'ft',
        },
      ],
    },
  ],
  [
    "'6 ft'",
    {},
    {
      value: 6,
      unit: 'ft',
      type: 'height',
      raw: "'6 ft'",
      matches: [
        {
          value: 6,
          unit: 'ft',
        },
      ],
    },
  ],
  [
    '6′',
    {},
    {
      value: 6,
      unit: 'ft',
      type: 'height',
      raw: '6′',
      matches: [
        {
          value: 6,
          unit: 'ft',
        },
      ],
    },
  ],
  [
    "72′'",
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: "72′'",
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    "72'′",
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: "72'′",
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  ["72 ′'", {}, null],
  ["five′'", {}, null],
  ["72.′'", {}, null],
  ["72′''", {}, null],
  [
    "'72'′",
    {},
    {
      value: 72,
      unit: 'ft',
      type: 'height',
      raw: "'72'′",
      matches: [
        {
          value: 72,
          unit: 'ft',
        },
      ],
    },
  ],
  [
    "about '6′'",
    {},
    {
      value: 6,
      unit: 'ft',
      type: 'height',
      raw: "about '6′'",
      matches: [
        {
          value: 6,
          unit: 'ft',
        },
      ],
    },
  ],
  [
    "'6′' tall.",
    {},
    {
      value: 6,
      unit: 'ft',
      type: 'height',
      raw: "'6′' tall.",
      matches: [
        {
          value: 6,
          unit: 'ft',
        },
      ],
    },
  ],
  ["'6′", {}, null],
  ["72′ '", {}, null],
  ["72' ′", {}, null],
  [
    '"72′\'"',
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: '"72′\'"',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '"72\'′"',
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: '"72\'′"',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    "'72′''",
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: "'72′''",
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    "'72'′'",
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: "'72'′'",
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    "about '72′''",
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: "about '72′''",
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    "about '72'′'",
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: "about '72'′'",
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    "'72′''.",
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: "'72′''.",
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    "'72' ′",
    {},
    {
      value: 72,
      unit: 'ft',
      type: 'height',
      raw: "'72' ′",
      matches: [
        {
          value: 72,
          unit: 'ft',
        },
      ],
    },
  ],
  [
    "'72′'",
    {},
    {
      value: 72,
      unit: 'ft',
      type: 'height',
      raw: "'72′'",
      matches: [
        {
          value: 72,
          unit: 'ft',
        },
      ],
    },
  ],
  ["'72′'''", {}, null],
  ["72′'1/2 kg", {}, null],
  [
    "'0.5′''",
    {},
    {
      value: 0.5,
      unit: 'in',
      type: 'height',
      raw: "'0.5′''",
      matches: [
        {
          value: 0.5,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '"5 ft 11′\'"',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5 ft 11′\'"',
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
    '"5 ft 11\'′"',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5 ft 11\'′"',
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
    "'5 ft 11′''",
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: "'5 ft 11′''",
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
    "'5 ft 11'′'",
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: "'5 ft 11'′'",
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
    "about '5 ft 11′''.",
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: "about '5 ft 11′''.",
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
    '‘5’ 11′′',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '‘5’ 11′′',
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
    '‘5’ 11′′',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '‘5’ 11′′',
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
    '‘5’ 11′′',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '‘5’ 11′′',
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
    '‘5’ 11´´',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '‘5’ 11´´',
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
    '‘5’ 11´´',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '‘5’ 11´´',
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
    '‘5’ 11´´',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '‘5’ 11´´',
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
    '‘5’ 11ʹʹ',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '‘5’ 11ʹʹ',
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
    '‘5’ 11ʹʹ',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '‘5’ 11ʹʹ',
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
    '‘5’ 11ʹʹ',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '‘5’ 11ʹʹ',
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
    "‘5’ 11′'",
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: "‘5’ 11′'",
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
    "‘5’ 11′'",
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: "‘5’ 11′'",
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
    "‘5’ 11′'",
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: "‘5’ 11′'",
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
    "‘5’ 11'′",
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: "‘5’ 11'′",
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
    "‘5’ 11'′",
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: "‘5’ 11'′",
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
    "‘5’ 11'′",
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: "‘5’ 11'′",
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
    "‘5’ 11''",
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: "‘5’ 11''",
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
    "‘5’ 11''",
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: "‘5’ 11''",
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
    "‘5’ 11''",
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: "‘5’ 11''",
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
    '‘5’ 11’’',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '‘5’ 11’’',
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
    '‘5’ 11’’',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '‘5’ 11’’',
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
    '‘5’ 11’’',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '‘5’ 11’’',
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
  ['‘5’ 11 ′′', {}, null],
  ['‘5’ eleven′′', {}, null],
  ['‘5’ 11′ ′', {}, null],
  ["‘5’ 11′ '", {}, null],
  ["‘5’ 11' ′", {}, null],
  ['‘5’ 11′′′', {}, null],
  ['‘5’ 11′′ tail', {}, null],
  ['‘5’ 12′′', {}, null],
  [
    'about ‘5’ 11′′',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: 'about ‘5’ 11′′',
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
    '‘5’ 11′′.',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '‘5’ 11′′.',
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
    '‘5’ 11½′′',
    {},
    {
      value: 71.5,
      unit: 'in',
      type: 'height',
      raw: '‘5’ 11½′′',
      matches: [
        {
          value: 5,
          unit: 'ft',
        },
        {
          value: 11.5,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '‘5’ 11 1/2′′',
    {},
    {
      value: 71.5,
      unit: 'in',
      type: 'height',
      raw: '‘5’ 11 1/2′′',
      matches: [
        {
          value: 5,
          unit: 'ft',
        },
        {
          value: 11.5,
          unit: 'in',
        },
      ],
    },
  ],
];

describe('complete-entry quote and unit-mark boundaries', () => {
  it.each(cases)('reads the complete entry %s with %j', (raw, options, expected) => {
    expect(parseMeasurement(raw, options)).toEqual(expected);
  });
});
