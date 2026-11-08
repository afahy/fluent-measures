import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions, type ParsedValue } from '../src';

// AFA-250: frozen approved wrapper/pair routes and independent arithmetic.
const cases: [string, ParseOptions, ParsedValue | null][] = [
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
  [
    '"5\'11", 70 kg"',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
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
      normalizedUnit: 'kg',
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
  ['"5′11″, 70 kg"', {}, null],
  [
    '"70 kg, 5\'11""',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"70 kg, 5\'11""',
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
    '"70 kg, 5\'11""',
    {
      type: 'weight',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"70 kg, 5\'11""',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    '"70 kg, 5\'11""',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '"70 kg, 5\'11""',
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
    '"70 kg, 5\'11""',
    {
      normalizedUnit: 'kg',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"70 kg, 5\'11""',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  ['"70 kg, 5\'11""', {}, null],
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
  [
    '"5\'11", 70 kg',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
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
      normalizedUnit: 'kg',
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
      type: 'height',
    },
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
    '„5 ft 11”',
    {
      type: 'weight',
    },
    null,
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
      type: 'height',
    },
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
    '”5 ft 11”',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '“5 ft 11”',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '“5 ft 11”',
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
    '“5 ft 11”',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '“5 ft 11”',
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
    '“5 ft 11”',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '“5 ft 11”',
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
    {
      value: 72,
      unit: 'kg',
      type: 'weight',
      raw: '"72" kg, 180 cm',
      matches: [
        {
          value: 72,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    '"72" kg, 180 cm',
    {
      type: 'height',
    },
    {
      value: 180,
      unit: 'cm',
      type: 'height',
      raw: '"72" kg, 180 cm',
      matches: [
        {
          value: 180,
          unit: 'cm',
        },
      ],
    },
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
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5\'11", "70 kg"',
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
    '"5\'11", "70 kg"',
    {
      type: 'weight',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11", "70 kg"',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    '"5\'11", "70 kg"',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '"5\'11", "70 kg"',
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
    '"5\'11", "70 kg"',
    {
      normalizedUnit: 'kg',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11", "70 kg"',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  ['"5\'11"; 70 kg"', {}, null],
  [
    '"5\'11"; 70 kg"',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5\'11"; 70 kg"',
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
    '"5\'11"; 70 kg"',
    {
      type: 'weight',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11"; 70 kg"',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    '"5\'11"; 70 kg"',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '"5\'11"; 70 kg"',
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
    '"5\'11"; 70 kg"',
    {
      normalizedUnit: 'kg',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11"; 70 kg"',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  ['"5\'11"; 70 kg', {}, null],
  [
    '"5\'11"; 70 kg',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5\'11"; 70 kg',
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
    '"5\'11"; 70 kg',
    {
      type: 'weight',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11"; 70 kg',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    '"5\'11"; 70 kg',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '"5\'11"; 70 kg',
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
    '"5\'11"; 70 kg',
    {
      normalizedUnit: 'kg',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11"; 70 kg',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  ['"5\'11"; "70 kg"', {}, null],
  [
    '"5\'11"; "70 kg"',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5\'11"; "70 kg"',
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
    '"5\'11"; "70 kg"',
    {
      type: 'weight',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11"; "70 kg"',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    '"5\'11"; "70 kg"',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '"5\'11"; "70 kg"',
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
    '"5\'11"; "70 kg"',
    {
      normalizedUnit: 'kg',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11"; "70 kg"',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  ['"5\'11" / 70 kg"', {}, null],
  [
    '"5\'11" / 70 kg"',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5\'11" / 70 kg"',
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
    '"5\'11" / 70 kg"',
    {
      type: 'weight',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11" / 70 kg"',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    '"5\'11" / 70 kg"',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '"5\'11" / 70 kg"',
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
    '"5\'11" / 70 kg"',
    {
      normalizedUnit: 'kg',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11" / 70 kg"',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  ['"5\'11" / 70 kg', {}, null],
  [
    '"5\'11" / 70 kg',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5\'11" / 70 kg',
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
    '"5\'11" / 70 kg',
    {
      type: 'weight',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11" / 70 kg',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    '"5\'11" / 70 kg',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '"5\'11" / 70 kg',
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
    '"5\'11" / 70 kg',
    {
      normalizedUnit: 'kg',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11" / 70 kg',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  ['"5\'11" / "70 kg"', {}, null],
  [
    '"5\'11" / "70 kg"',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5\'11" / "70 kg"',
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
    '"5\'11" / "70 kg"',
    {
      type: 'weight',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11" / "70 kg"',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    '"5\'11" / "70 kg"',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '"5\'11" / "70 kg"',
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
    '"5\'11" / "70 kg"',
    {
      normalizedUnit: 'kg',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11" / "70 kg"',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  ['"5\'11" and 70 kg"', {}, null],
  [
    '"5\'11" and 70 kg"',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5\'11" and 70 kg"',
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
    '"5\'11" and 70 kg"',
    {
      type: 'weight',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11" and 70 kg"',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    '"5\'11" and 70 kg"',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '"5\'11" and 70 kg"',
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
    '"5\'11" and 70 kg"',
    {
      normalizedUnit: 'kg',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11" and 70 kg"',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  ['"5\'11" and 70 kg', {}, null],
  [
    '"5\'11" and 70 kg',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5\'11" and 70 kg',
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
    '"5\'11" and 70 kg',
    {
      type: 'weight',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11" and 70 kg',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    '"5\'11" and 70 kg',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '"5\'11" and 70 kg',
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
    '"5\'11" and 70 kg',
    {
      normalizedUnit: 'kg',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11" and 70 kg',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  ['"5\'11" and "70 kg"', {}, null],
  [
    '"5\'11" and "70 kg"',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5\'11" and "70 kg"',
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
    '"5\'11" and "70 kg"',
    {
      type: 'weight',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11" and "70 kg"',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    '"5\'11" and "70 kg"',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '"5\'11" and "70 kg"',
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
    '"5\'11" and "70 kg"',
    {
      normalizedUnit: 'kg',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11" and "70 kg"',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  ['"5\'11" (70 kg)"', {}, null],
  [
    '"5\'11" (70 kg)"',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5\'11" (70 kg)"',
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
    '"5\'11" (70 kg)"',
    {
      type: 'weight',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11" (70 kg)"',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    '"5\'11" (70 kg)"',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '"5\'11" (70 kg)"',
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
    '"5\'11" (70 kg)"',
    {
      normalizedUnit: 'kg',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11" (70 kg)"',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  ['"5\'11" (70 kg)', {}, null],
  [
    '"5\'11" (70 kg)',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5\'11" (70 kg)',
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
    '"5\'11" (70 kg)',
    {
      type: 'weight',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11" (70 kg)',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    '"5\'11" (70 kg)',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '"5\'11" (70 kg)',
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
    '"5\'11" (70 kg)',
    {
      normalizedUnit: 'kg',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11" (70 kg)',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  ['"5\'11" [70 kg]"', {}, null],
  [
    '"5\'11" [70 kg]"',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5\'11" [70 kg]"',
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
    '"5\'11" [70 kg]"',
    {
      type: 'weight',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11" [70 kg]"',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    '"5\'11" [70 kg]"',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '"5\'11" [70 kg]"',
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
    '"5\'11" [70 kg]"',
    {
      normalizedUnit: 'kg',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11" [70 kg]"',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  ['"5\'11" [70 kg]', {}, null],
  [
    '"5\'11" [70 kg]',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5\'11" [70 kg]',
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
    '"5\'11" [70 kg]',
    {
      type: 'weight',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11" [70 kg]',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    '"5\'11" [70 kg]',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '"5\'11" [70 kg]',
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
    '"5\'11" [70 kg]',
    {
      normalizedUnit: 'kg',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11" [70 kg]',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  ['"72", 70 kg"', {}, null],
  [
    '"72", 70 kg"',
    {
      type: 'height',
    },
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: '"72", 70 kg"',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '"72", 70 kg"',
    {
      type: 'weight',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"72", 70 kg"',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    '"72", 70 kg"',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 182.88,
      unit: 'cm',
      type: 'height',
      raw: '"72", 70 kg"',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '"72", 70 kg"',
    {
      normalizedUnit: 'kg',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"72", 70 kg"',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  ['"72" kg, 180 cm', {}, null],
  [
    '"72" kg, 180 cm',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180,
      unit: 'cm',
      type: 'height',
      raw: '"72" kg, 180 cm',
      matches: [
        {
          value: 180,
          unit: 'cm',
        },
      ],
    },
  ],
  [
    '"72" kg, 180 cm',
    {
      normalizedUnit: 'kg',
    },
    {
      value: 72,
      unit: 'kg',
      type: 'weight',
      raw: '"72" kg, 180 cm',
      matches: [
        {
          value: 72,
          unit: 'kg',
        },
      ],
    },
  ],
  ['"72" kg; 180 cm', {}, null],
  [
    '"72" kg; 180 cm',
    {
      type: 'height',
    },
    {
      value: 180,
      unit: 'cm',
      type: 'height',
      raw: '"72" kg; 180 cm',
      matches: [
        {
          value: 180,
          unit: 'cm',
        },
      ],
    },
  ],
  [
    '"72" kg; 180 cm',
    {
      type: 'weight',
    },
    {
      value: 72,
      unit: 'kg',
      type: 'weight',
      raw: '"72" kg; 180 cm',
      matches: [
        {
          value: 72,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    '"72" kg; 180 cm',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180,
      unit: 'cm',
      type: 'height',
      raw: '"72" kg; 180 cm',
      matches: [
        {
          value: 180,
          unit: 'cm',
        },
      ],
    },
  ],
  [
    '"72" kg; 180 cm',
    {
      normalizedUnit: 'kg',
    },
    {
      value: 72,
      unit: 'kg',
      type: 'weight',
      raw: '"72" kg; 180 cm',
      matches: [
        {
          value: 72,
          unit: 'kg',
        },
      ],
    },
  ],
  ['"5\'11", 70 kg".', {}, null],
  [
    '"5\'11", 70 kg".',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5\'11", 70 kg".',
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
    '"5\'11", 70 kg".',
    {
      type: 'weight',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11", 70 kg".',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    '"5\'11", 70 kg".',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '"5\'11", 70 kg".',
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
    '"5\'11", 70 kg".',
    {
      normalizedUnit: 'kg',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11", 70 kg".',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  ['"5\'11"; 70 kg".', {}, null],
  [
    '"5\'11"; 70 kg".',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5\'11"; 70 kg".',
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
    '"5\'11"; 70 kg".',
    {
      type: 'weight',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11"; 70 kg".',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    '"5\'11"; 70 kg".',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '"5\'11"; 70 kg".',
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
    '"5\'11"; 70 kg".',
    {
      normalizedUnit: 'kg',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11"; 70 kg".',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  ['"5\'11" and 70 kg".', {}, null],
  [
    '"5\'11" and 70 kg".',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '"5\'11" and 70 kg".',
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
    '"5\'11" and 70 kg".',
    {
      type: 'weight',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11" and 70 kg".',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    '"5\'11" and 70 kg".',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '"5\'11" and 70 kg".',
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
    '"5\'11" and 70 kg".',
    {
      normalizedUnit: 'kg',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '"5\'11" and 70 kg".',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    '„1 m 80”',
    {},
    {
      value: 180,
      unit: 'cm',
      type: 'height',
      raw: '„1 m 80”',
      matches: [
        {
          value: 1,
          unit: 'm',
        },
        {
          value: 80,
          unit: 'cm',
        },
      ],
    },
  ],
  [
    '„1 m 80”',
    {
      type: 'height',
    },
    {
      value: 180,
      unit: 'cm',
      type: 'height',
      raw: '„1 m 80”',
      matches: [
        {
          value: 1,
          unit: 'm',
        },
        {
          value: 80,
          unit: 'cm',
        },
      ],
    },
  ],
  [
    '„1 m 80”',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180,
      unit: 'cm',
      type: 'height',
      raw: '„1 m 80”',
      matches: [
        {
          value: 1,
          unit: 'm',
        },
        {
          value: 80,
          unit: 'cm',
        },
      ],
    },
  ],
  [
    '„1 m 80”',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '„72” kg',
    {},
    {
      value: 72,
      unit: 'kg',
      type: 'weight',
      raw: '„72” kg',
      matches: [
        {
          value: 72,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    '„72” in',
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: '„72” in',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    'about „5 ft 11” tall.',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: 'about „5 ft 11” tall.',
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
    '”1 m 80”',
    {},
    {
      value: 180,
      unit: 'cm',
      type: 'height',
      raw: '”1 m 80”',
      matches: [
        {
          value: 1,
          unit: 'm',
        },
        {
          value: 80,
          unit: 'cm',
        },
      ],
    },
  ],
  [
    '”1 m 80”',
    {
      type: 'height',
    },
    {
      value: 180,
      unit: 'cm',
      type: 'height',
      raw: '”1 m 80”',
      matches: [
        {
          value: 1,
          unit: 'm',
        },
        {
          value: 80,
          unit: 'cm',
        },
      ],
    },
  ],
  [
    '”1 m 80”',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180,
      unit: 'cm',
      type: 'height',
      raw: '”1 m 80”',
      matches: [
        {
          value: 1,
          unit: 'm',
        },
        {
          value: 80,
          unit: 'cm',
        },
      ],
    },
  ],
  [
    '”1 m 80”',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '”72” kg',
    {},
    {
      value: 72,
      unit: 'kg',
      type: 'weight',
      raw: '”72” kg',
      matches: [
        {
          value: 72,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    '”72” in',
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: '”72” in',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    'about ”5 ft 11” tall.',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: 'about ”5 ft 11” tall.',
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
    '“1 m 80”',
    {},
    {
      value: 180,
      unit: 'cm',
      type: 'height',
      raw: '“1 m 80”',
      matches: [
        {
          value: 1,
          unit: 'm',
        },
        {
          value: 80,
          unit: 'cm',
        },
      ],
    },
  ],
  [
    '“1 m 80”',
    {
      type: 'height',
    },
    {
      value: 180,
      unit: 'cm',
      type: 'height',
      raw: '“1 m 80”',
      matches: [
        {
          value: 1,
          unit: 'm',
        },
        {
          value: 80,
          unit: 'cm',
        },
      ],
    },
  ],
  [
    '“1 m 80”',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180,
      unit: 'cm',
      type: 'height',
      raw: '“1 m 80”',
      matches: [
        {
          value: 1,
          unit: 'm',
        },
        {
          value: 80,
          unit: 'cm',
        },
      ],
    },
  ],
  [
    '“1 m 80”',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '“72” kg',
    {},
    {
      value: 72,
      unit: 'kg',
      type: 'weight',
      raw: '“72” kg',
      matches: [
        {
          value: 72,
          unit: 'kg',
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
    'about “5 ft 11” tall.',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: 'about “5 ft 11” tall.',
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
    '‚5 ft 11’',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '‚5 ft 11’',
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
    '‚5 ft 11’',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '‚5 ft 11’',
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
    '‚5 ft 11’',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '‚5 ft 11’',
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
    '‚5 ft 11’',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '‚1 m 80’',
    {},
    {
      value: 180,
      unit: 'cm',
      type: 'height',
      raw: '‚1 m 80’',
      matches: [
        {
          value: 1,
          unit: 'm',
        },
        {
          value: 80,
          unit: 'cm',
        },
      ],
    },
  ],
  [
    '‚1 m 80’',
    {
      type: 'height',
    },
    {
      value: 180,
      unit: 'cm',
      type: 'height',
      raw: '‚1 m 80’',
      matches: [
        {
          value: 1,
          unit: 'm',
        },
        {
          value: 80,
          unit: 'cm',
        },
      ],
    },
  ],
  [
    '‚1 m 80’',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180,
      unit: 'cm',
      type: 'height',
      raw: '‚1 m 80’',
      matches: [
        {
          value: 1,
          unit: 'm',
        },
        {
          value: 80,
          unit: 'cm',
        },
      ],
    },
  ],
  [
    '‚1 m 80’',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '‚72’ kg',
    {},
    {
      value: 72,
      unit: 'kg',
      type: 'weight',
      raw: '‚72’ kg',
      matches: [
        {
          value: 72,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    '‚72’ in',
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: '‚72’ in',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    'about ‚5 ft 11’ tall.',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: 'about ‚5 ft 11’ tall.',
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
    '‘5 ft 11’',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '‘5 ft 11’',
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
    '‘5 ft 11’',
    {
      type: 'height',
    },
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '‘5 ft 11’',
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
    '‘5 ft 11’',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '‘5 ft 11’',
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
    '‘5 ft 11’',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '‘1 m 80’',
    {},
    {
      value: 180,
      unit: 'cm',
      type: 'height',
      raw: '‘1 m 80’',
      matches: [
        {
          value: 1,
          unit: 'm',
        },
        {
          value: 80,
          unit: 'cm',
        },
      ],
    },
  ],
  [
    '‘1 m 80’',
    {
      type: 'height',
    },
    {
      value: 180,
      unit: 'cm',
      type: 'height',
      raw: '‘1 m 80’',
      matches: [
        {
          value: 1,
          unit: 'm',
        },
        {
          value: 80,
          unit: 'cm',
        },
      ],
    },
  ],
  [
    '‘1 m 80’',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 180,
      unit: 'cm',
      type: 'height',
      raw: '‘1 m 80’',
      matches: [
        {
          value: 1,
          unit: 'm',
        },
        {
          value: 80,
          unit: 'cm',
        },
      ],
    },
  ],
  [
    '‘1 m 80’',
    {
      type: 'weight',
    },
    null,
  ],
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
  [
    '‘72’ in',
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: '‘72’ in',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    'about ‘5 ft 11’ tall.',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: 'about ‘5 ft 11’ tall.',
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
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: '72” and ”70” kg',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '72” and ”70” kg',
    {
      type: 'weight',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '72” and ”70” kg',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  [
    '72” and ”70” kg',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 182.88,
      unit: 'cm',
      type: 'height',
      raw: '72” and ”70” kg',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '72” and ”70” kg',
    {
      normalizedUnit: 'kg',
    },
    {
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '72” and ”70” kg',
      matches: [
        {
          value: 70,
          unit: 'kg',
        },
      ],
    },
  ],
  ['“72” or 70”', {}, null],
  ['”72” or 70”', {}, null],
];

describe('complete entry fifth review', () => {
  it.each(cases)('reads %s with %j', (raw, options, expected) => {
    expect(parseMeasurement(raw, options)).toEqual(expected);
  });
});
