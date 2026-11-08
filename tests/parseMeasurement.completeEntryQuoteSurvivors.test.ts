import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions, type ParsedValue } from '../src';

// AFA-250: independently approved wrapper, pair, paired-inch and bare-inference rules.
const cases: [string, ParseOptions, ParsedValue | null][] = [
  ["\"5'11''", {}, null],
  [
    "\"5'11''",
    {
      type: 'height',
    },
    null,
  ],
  [
    "\"5'11''",
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  ["about \"5'11''", {}, null],
  [
    "about \"5'11''",
    {
      type: 'height',
    },
    null,
  ],
  [
    "about \"5'11''",
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  ["\"5 ft 11''", {}, null],
  [
    "\"5 ft 11''",
    {
      type: 'height',
    },
    null,
  ],
  [
    "\"5 ft 11''",
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    "\"5'11''\"",
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: "\"5'11''\"",
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
    "about \"5'11''\"",
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: "about \"5'11''\"",
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
    '"5 ft 11\'\'"',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5 ft 11\'\'"',
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
    "5'11''",
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: "5'11''",
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
    "5 ft 11''",
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: "5 ft 11''",
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
  ["'5'11\", 70 kg'", {}, null],
  [
    "'5'11\", 70 kg'",
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: "'5'11\", 70 kg'",
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
    "'5'11\", 70 kg'",
    {
      type: 'weight',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: "'5'11\", 70 kg'",
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    "'5'11\", 70 kg'",
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: "'5'11\", 70 kg'",
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
    "'5'11\", 70 kg'",
    {
      normalizedUnit: 'kg',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: "'5'11\", 70 kg'",
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  ["'5′11″, 70 kg'", {}, null],
  [
    "'5′11″, 70 kg'",
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: "'5′11″, 70 kg'",
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
    "'5′11″, 70 kg'",
    {
      type: 'weight',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: "'5′11″, 70 kg'",
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    "'5′11″, 70 kg'",
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: "'5′11″, 70 kg'",
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
    "'5′11″, 70 kg'",
    {
      normalizedUnit: 'kg',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: "'5′11″, 70 kg'",
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  ["about '5'11\", 70 kg'", {}, null],
  [
    "about '5'11\", 70 kg'",
    {
      type: 'height',
    },
    null,
  ],
  [
    "about '5'11\", 70 kg'",
    {
      type: 'weight',
    },
    null,
  ],
  [
    "about '5'11\", 70 kg'",
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    "about '5'11\", 70 kg'",
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  [
    '"72"',
    {
      type: 'height',
      allowUnqualified: true,
    },
    null,
  ],
  [
    '"72"',
    {
      type: 'weight',
      allowUnqualified: true,
      inferUnit: 'metric',
    },
    null,
  ],
  [
    "'72'",
    {
      type: 'height',
      allowUnqualified: true,
    },
    null,
  ],
  [
    "'72'",
    {
      type: 'weight',
      allowUnqualified: true,
      inferUnit: 'metric',
    },
    null,
  ],
  [
    '(72)',
    {
      type: 'height',
      allowUnqualified: true,
    },
    null,
  ],
  [
    '(72)',
    {
      type: 'weight',
      allowUnqualified: true,
      inferUnit: 'metric',
    },
    null,
  ],
  [
    '72',
    {
      type: 'height',
      allowUnqualified: true,
    },
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: '72',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '72',
    {
      type: 'weight',
      allowUnqualified: true,
      inferUnit: 'metric',
    },
    {
      value: 72,
      unit: 'kg',
      type: 'weight',
      raw: '72',
      matches: [
        {
          value: 72,
          unit: 'kg',
        },
      ],
    },
  ],
  ["about \"5'11''\",70kg", {}, null],
  [
    "about \"5'11''\",70kg",
    {
      type: 'height',
    },
    null,
  ],
  [
    "about \"5'11''\",70kg",
    {
      type: 'weight',
    },
    null,
  ],
  [
    "about \"5'11''\",70kg",
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    "about \"5'11''\",70kg",
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  ["about 5'11'',70kg", {}, null],
  [
    "about 5'11'',70kg",
    {
      type: 'height',
    },
    null,
  ],
  [
    "about 5'11'',70kg",
    {
      type: 'weight',
    },
    null,
  ],
  [
    "about 5'11'',70kg",
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    "about 5'11'',70kg",
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  ["about \"5'11''\", 70kg", {}, null],
  [
    "about \"5'11''\", 70kg",
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: "about \"5'11''\", 70kg",
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
    "about \"5'11''\", 70kg",
    {
      type: 'weight',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: "about \"5'11''\", 70kg",
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    "about \"5'11''\", 70kg",
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: "about \"5'11''\", 70kg",
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
    "about \"5'11''\", 70kg",
    {
      normalizedUnit: 'kg',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: "about \"5'11''\", 70kg",
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  ["about 5'11'', 70kg", {}, null],
  [
    "about 5'11'', 70kg",
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: "about 5'11'', 70kg",
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
    "about 5'11'', 70kg",
    {
      type: 'weight',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: "about 5'11'', 70kg",
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    "about 5'11'', 70kg",
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: "about 5'11'', 70kg",
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
    "about 5'11'', 70kg",
    {
      normalizedUnit: 'kg',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: "about 5'11'', 70kg",
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
];

describe('quote identity mutation controls', () => {
  it.each(cases)('reads %s with %j', (raw, options, expected) => {
    expect(parseMeasurement(raw, options)).toEqual(expected);
  });
});
