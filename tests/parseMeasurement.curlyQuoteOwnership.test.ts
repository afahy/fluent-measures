import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParsedValue } from '../src';

// AFA-265 review: one entry wrapper may contain a quoted number. Existing quoted-feet
// interpretations remain; compound totals below are independently feet * 12 + inches.
const cases: [string, number, ParsedValue['unit'], ParsedValue['type'], ParsedValue['matches']][] =
  [
    [
      '‘‘5’’’',
      5,
      'ft',
      'height',
      [
        {
          value: 5,
          unit: 'ft',
        },
      ],
    ],
    [
      '‘‘11’’’',
      11,
      'ft',
      'height',
      [
        {
          value: 11,
          unit: 'ft',
        },
      ],
    ],
    [
      '‘5’’5',
      65,
      'in',
      'height',
      [
        {
          value: 5,
          unit: 'ft',
        },
        {
          value: 5,
          unit: 'in',
        },
      ],
    ],
    [
      '‘5’’5”',
      65,
      'in',
      'height',
      [
        {
          value: 5,
          unit: 'ft',
        },
        {
          value: 5,
          unit: 'in',
        },
      ],
    ],
    [
      '‘5’’5 ',
      65,
      'in',
      'height',
      [
        {
          value: 5,
          unit: 'ft',
        },
        {
          value: 5,
          unit: 'in',
        },
      ],
    ],
    [
      '‘5’’5in',
      65,
      'in',
      'height',
      [
        {
          value: 5,
          unit: 'ft',
        },
        {
          value: 5,
          unit: 'in',
        },
      ],
    ],
    [
      '‘5’’5"',
      65,
      'in',
      'height',
      [
        {
          value: 5,
          unit: 'ft',
        },
        {
          value: 5,
          unit: 'in',
        },
      ],
    ],
    [
      '‘5’’11',
      71,
      'in',
      'height',
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
      '‘5’’11”',
      71,
      'in',
      'height',
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
      '‘5’’11 ',
      71,
      'in',
      'height',
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
      '‘5’’11in',
      71,
      'in',
      'height',
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
      '‘5’’11"',
      71,
      'in',
      'height',
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
      '‘5’’ 5',
      65,
      'in',
      'height',
      [
        {
          value: 5,
          unit: 'ft',
        },
        {
          value: 5,
          unit: 'in',
        },
      ],
    ],
    [
      '‘5’’ 11',
      71,
      'in',
      'height',
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
      '‘5’’ six',
      66,
      'in',
      'height',
      [
        {
          value: 5,
          unit: 'ft',
        },
        {
          value: 6,
          unit: 'in',
        },
      ],
    ],
    [
      '‘5’’six',
      66,
      'in',
      'height',
      [
        {
          value: 5,
          unit: 'ft',
        },
        {
          value: 6,
          unit: 'in',
        },
      ],
    ],
    [
      '‘5’’six”',
      66,
      'in',
      'height',
      [
        {
          value: 5,
          unit: 'ft',
        },
        {
          value: 6,
          unit: 'in',
        },
      ],
    ],
    [
      '‘5’’six ',
      66,
      'in',
      'height',
      [
        {
          value: 5,
          unit: 'ft',
        },
        {
          value: 6,
          unit: 'in',
        },
      ],
    ],
    [
      '‘5’’six"',
      66,
      'in',
      'height',
      [
        {
          value: 5,
          unit: 'ft',
        },
        {
          value: 6,
          unit: 'in',
        },
      ],
    ],
    [
      '‘5’ ’5',
      65,
      'in',
      'height',
      [
        {
          value: 5,
          unit: 'ft',
        },
        {
          value: 5,
          unit: 'in',
        },
      ],
    ],
    [
      '‘5’ ’11',
      71,
      'in',
      'height',
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
      '‘5’ ’six',
      66,
      'in',
      'height',
      [
        {
          value: 5,
          unit: 'ft',
        },
        {
          value: 6,
          unit: 'in',
        },
      ],
    ],
    [
      '‘55’’5',
      665,
      'in',
      'height',
      [
        {
          value: 55,
          unit: 'ft',
        },
        {
          value: 5,
          unit: 'in',
        },
      ],
    ],
    [
      '‘55’’11',
      671,
      'in',
      'height',
      [
        {
          value: 55,
          unit: 'ft',
        },
        {
          value: 11,
          unit: 'in',
        },
      ],
    ],
    [
      '‘55’’six',
      666,
      'in',
      'height',
      [
        {
          value: 55,
          unit: 'ft',
        },
        {
          value: 6,
          unit: 'in',
        },
      ],
    ],
    [
      '‘511’’5',
      6137,
      'in',
      'height',
      [
        {
          value: 511,
          unit: 'ft',
        },
        {
          value: 5,
          unit: 'in',
        },
      ],
    ],
    [
      '‘511’’11',
      6143,
      'in',
      'height',
      [
        {
          value: 511,
          unit: 'ft',
        },
        {
          value: 11,
          unit: 'in',
        },
      ],
    ],
    [
      '‘511’’six',
      6138,
      'in',
      'height',
      [
        {
          value: 511,
          unit: 'ft',
        },
        {
          value: 6,
          unit: 'in',
        },
      ],
    ],
    [
      '‘11’’5',
      137,
      'in',
      'height',
      [
        {
          value: 11,
          unit: 'ft',
        },
        {
          value: 5,
          unit: 'in',
        },
      ],
    ],
    [
      '‘11’’5”',
      137,
      'in',
      'height',
      [
        {
          value: 11,
          unit: 'ft',
        },
        {
          value: 5,
          unit: 'in',
        },
      ],
    ],
    [
      '‘11’’5 ',
      137,
      'in',
      'height',
      [
        {
          value: 11,
          unit: 'ft',
        },
        {
          value: 5,
          unit: 'in',
        },
      ],
    ],
    [
      '‘11’’5in',
      137,
      'in',
      'height',
      [
        {
          value: 11,
          unit: 'ft',
        },
        {
          value: 5,
          unit: 'in',
        },
      ],
    ],
    [
      '‘11’’5"',
      137,
      'in',
      'height',
      [
        {
          value: 11,
          unit: 'ft',
        },
        {
          value: 5,
          unit: 'in',
        },
      ],
    ],
    [
      '‘11’’11',
      143,
      'in',
      'height',
      [
        {
          value: 11,
          unit: 'ft',
        },
        {
          value: 11,
          unit: 'in',
        },
      ],
    ],
    [
      '‘11’’11”',
      143,
      'in',
      'height',
      [
        {
          value: 11,
          unit: 'ft',
        },
        {
          value: 11,
          unit: 'in',
        },
      ],
    ],
    [
      '‘11’’11 ',
      143,
      'in',
      'height',
      [
        {
          value: 11,
          unit: 'ft',
        },
        {
          value: 11,
          unit: 'in',
        },
      ],
    ],
    [
      '‘11’’11in',
      143,
      'in',
      'height',
      [
        {
          value: 11,
          unit: 'ft',
        },
        {
          value: 11,
          unit: 'in',
        },
      ],
    ],
    [
      '‘11’’11"',
      143,
      'in',
      'height',
      [
        {
          value: 11,
          unit: 'ft',
        },
        {
          value: 11,
          unit: 'in',
        },
      ],
    ],
    [
      '‘11’’ 5',
      137,
      'in',
      'height',
      [
        {
          value: 11,
          unit: 'ft',
        },
        {
          value: 5,
          unit: 'in',
        },
      ],
    ],
    [
      '‘11’’ 11',
      143,
      'in',
      'height',
      [
        {
          value: 11,
          unit: 'ft',
        },
        {
          value: 11,
          unit: 'in',
        },
      ],
    ],
    [
      '‘11’’ six',
      138,
      'in',
      'height',
      [
        {
          value: 11,
          unit: 'ft',
        },
        {
          value: 6,
          unit: 'in',
        },
      ],
    ],
    [
      '‘11’’six',
      138,
      'in',
      'height',
      [
        {
          value: 11,
          unit: 'ft',
        },
        {
          value: 6,
          unit: 'in',
        },
      ],
    ],
    [
      '‘11’’six”',
      138,
      'in',
      'height',
      [
        {
          value: 11,
          unit: 'ft',
        },
        {
          value: 6,
          unit: 'in',
        },
      ],
    ],
    [
      '‘11’’six ',
      138,
      'in',
      'height',
      [
        {
          value: 11,
          unit: 'ft',
        },
        {
          value: 6,
          unit: 'in',
        },
      ],
    ],
    [
      '‘11’’six"',
      138,
      'in',
      'height',
      [
        {
          value: 11,
          unit: 'ft',
        },
        {
          value: 6,
          unit: 'in',
        },
      ],
    ],
    [
      '‘11’ ’5',
      137,
      'in',
      'height',
      [
        {
          value: 11,
          unit: 'ft',
        },
        {
          value: 5,
          unit: 'in',
        },
      ],
    ],
    [
      '‘11’ ’11',
      143,
      'in',
      'height',
      [
        {
          value: 11,
          unit: 'ft',
        },
        {
          value: 11,
          unit: 'in',
        },
      ],
    ],
    [
      '‘11’ ’six',
      138,
      'in',
      'height',
      [
        {
          value: 11,
          unit: 'ft',
        },
        {
          value: 6,
          unit: 'in',
        },
      ],
    ],
    [
      '‘115’’5',
      1385,
      'in',
      'height',
      [
        {
          value: 115,
          unit: 'ft',
        },
        {
          value: 5,
          unit: 'in',
        },
      ],
    ],
    [
      '‘115’’11',
      1391,
      'in',
      'height',
      [
        {
          value: 115,
          unit: 'ft',
        },
        {
          value: 11,
          unit: 'in',
        },
      ],
    ],
    [
      '‘115’’six',
      1386,
      'in',
      'height',
      [
        {
          value: 115,
          unit: 'ft',
        },
        {
          value: 6,
          unit: 'in',
        },
      ],
    ],
    [
      '‘1111’’5',
      13337,
      'in',
      'height',
      [
        {
          value: 1111,
          unit: 'ft',
        },
        {
          value: 5,
          unit: 'in',
        },
      ],
    ],
    [
      '‘1111’’11',
      13343,
      'in',
      'height',
      [
        {
          value: 1111,
          unit: 'ft',
        },
        {
          value: 11,
          unit: 'in',
        },
      ],
    ],
    [
      '‘1111’’six',
      13338,
      'in',
      'height',
      [
        {
          value: 1111,
          unit: 'ft',
        },
        {
          value: 6,
          unit: 'in',
        },
      ],
    ],
    [
      '‘ 5’’5',
      65,
      'in',
      'height',
      [
        {
          value: 5,
          unit: 'ft',
        },
        {
          value: 5,
          unit: 'in',
        },
      ],
    ],
    [
      '‘ 5’’11',
      71,
      'in',
      'height',
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
      '‘ 5’’six',
      66,
      'in',
      'height',
      [
        {
          value: 5,
          unit: 'ft',
        },
        {
          value: 6,
          unit: 'in',
        },
      ],
    ],
    [
      '‘ 11’’5',
      137,
      'in',
      'height',
      [
        {
          value: 11,
          unit: 'ft',
        },
        {
          value: 5,
          unit: 'in',
        },
      ],
    ],
    [
      '‘ 11’’11',
      143,
      'in',
      'height',
      [
        {
          value: 11,
          unit: 'ft',
        },
        {
          value: 11,
          unit: 'in',
        },
      ],
    ],
    [
      '‘ 11’’six',
      138,
      'in',
      'height',
      [
        {
          value: 11,
          unit: 'ft',
        },
        {
          value: 6,
          unit: 'in',
        },
      ],
    ],
    [
      '‘ft‘six’’',
      6,
      'ft',
      'height',
      [
        {
          value: 6,
          unit: 'ft',
        },
      ],
    ],
    [
      '‘kg‘six’’',
      6,
      'kg',
      'weight',
      [
        {
          value: 6,
          unit: 'kg',
        },
      ],
    ],
    [
      "‘'5''’",
      5,
      'ft',
      'height',
      [
        {
          value: 5,
          unit: 'ft',
        },
      ],
    ],
    [
      "‘'11''’",
      11,
      'ft',
      'height',
      [
        {
          value: 11,
          unit: 'ft',
        },
      ],
    ],
    [
      '“‘5’’”',
      5,
      'ft',
      'height',
      [
        {
          value: 5,
          unit: 'ft',
        },
      ],
    ],
    [
      '“‘11’’”',
      11,
      'ft',
      'height',
      [
        {
          value: 11,
          unit: 'ft',
        },
      ],
    ],
    [
      '“ft“5””',
      5,
      'ft',
      'height',
      [
        {
          value: 5,
          unit: 'ft',
        },
      ],
    ],
    [
      '“ft“11””',
      11,
      'ft',
      'height',
      [
        {
          value: 11,
          unit: 'ft',
        },
      ],
    ],
    [
      '“ft“six””',
      6,
      'ft',
      'height',
      [
        {
          value: 6,
          unit: 'ft',
        },
      ],
    ],
    [
      '“kg“5””',
      5,
      'kg',
      'weight',
      [
        {
          value: 5,
          unit: 'kg',
        },
      ],
    ],
    [
      '“kg“11””',
      11,
      'kg',
      'weight',
      [
        {
          value: 11,
          unit: 'kg',
        },
      ],
    ],
    [
      '“kg“six””',
      6,
      'kg',
      'weight',
      [
        {
          value: 6,
          unit: 'kg',
        },
      ],
    ],
    [
      '”‘5’’”',
      5,
      'ft',
      'height',
      [
        {
          value: 5,
          unit: 'ft',
        },
      ],
    ],
    [
      '”‘11’’”',
      11,
      'ft',
      'height',
      [
        {
          value: 11,
          unit: 'ft',
        },
      ],
    ],
    [
      ' ‘5’’5',
      65,
      'in',
      'height',
      [
        {
          value: 5,
          unit: 'ft',
        },
        {
          value: 5,
          unit: 'in',
        },
      ],
    ],
    [
      ' ‘5’’11',
      71,
      'in',
      'height',
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
      ' ‘5’’six',
      66,
      'in',
      'height',
      [
        {
          value: 5,
          unit: 'ft',
        },
        {
          value: 6,
          unit: 'in',
        },
      ],
    ],
    [
      ' ‘11’’5',
      137,
      'in',
      'height',
      [
        {
          value: 11,
          unit: 'ft',
        },
        {
          value: 5,
          unit: 'in',
        },
      ],
    ],
    [
      ' ‘11’’11',
      143,
      'in',
      'height',
      [
        {
          value: 11,
          unit: 'ft',
        },
        {
          value: 11,
          unit: 'in',
        },
      ],
    ],
    [
      ' ‘11’’six',
      138,
      'in',
      'height',
      [
        {
          value: 11,
          unit: 'ft',
        },
        {
          value: 6,
          unit: 'in',
        },
      ],
    ],
    [
      "'‘5’’'",
      5,
      'ft',
      'height',
      [
        {
          value: 5,
          unit: 'ft',
        },
      ],
    ],
    [
      "'‘11’’'",
      11,
      'ft',
      'height',
      [
        {
          value: 11,
          unit: 'ft',
        },
      ],
    ],
    [
      "'ft‘5’’",
      5,
      'ft',
      'height',
      [
        {
          value: 5,
          unit: 'ft',
        },
      ],
    ],
    [
      "'ft‘11’’",
      11,
      'ft',
      'height',
      [
        {
          value: 11,
          unit: 'ft',
        },
      ],
    ],
    [
      "'kg‘5’’",
      5,
      'kg',
      'weight',
      [
        {
          value: 5,
          unit: 'kg',
        },
      ],
    ],
    [
      "'kg‘11’’",
      11,
      'kg',
      'weight',
      [
        {
          value: 11,
          unit: 'kg',
        },
      ],
    ],
    [
      '"‘5’’"',
      5,
      'ft',
      'height',
      [
        {
          value: 5,
          unit: 'ft',
        },
      ],
    ],
    [
      '"‘11’’"',
      11,
      'ft',
      'height',
      [
        {
          value: 11,
          unit: 'ft',
        },
      ],
    ],
    [
      '“lbs “180””',
      180,
      'lb',
      'weight',
      [
        {
          value: 180,
          unit: 'lb',
        },
      ],
    ],
    [
      '“kg “72””',
      72,
      'kg',
      'weight',
      [
        {
          value: 72,
          unit: 'kg',
        },
      ],
    ],
    [
      '“kg: “72””',
      72,
      'kg',
      'weight',
      [
        {
          value: 72,
          unit: 'kg',
        },
      ],
    ],
    [
      '“lbs “180” ”',
      180,
      'lb',
      'weight',
      [
        {
          value: 180,
          unit: 'lb',
        },
      ],
    ],
    [
      '“ft “6””',
      6,
      'ft',
      'height',
      [
        {
          value: 6,
          unit: 'ft',
        },
      ],
    ],
    [
      '‘‘6’’’ tall',
      6,
      'ft',
      'height',
      [
        {
          value: 6,
          unit: 'ft',
        },
      ],
    ],
    [
      "''5'''",
      5,
      'ft',
      'height',
      [
        {
          value: 5,
          unit: 'ft',
        },
      ],
    ],
    [
      '‘5’ ’11”',
      71,
      'in',
      'height',
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
      '‘5’ ’ 11”',
      71,
      'in',
      'height',
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
      '‘5’  ’11 in',
      71,
      'in',
      'height',
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
      "‘5’ ’11''",
      71,
      'in',
      'height',
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
      '‘5’ ’ 11 inches',
      71,
      'in',
      'height',
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
      '‘5’ ’ 6’’',
      66,
      'in',
      'height',
      [
        {
          value: 5,
          unit: 'ft',
        },
        {
          value: 6,
          unit: 'in',
        },
      ],
    ],
  ];

describe('curly close ownership preserves numeric quotations', () => {
  it.each(cases)('keeps %s as %s %s', (raw, value, unit, type, matches) => {
    expect(parseMeasurement(raw)).toEqual({ value, unit, type, raw, matches });
  });
});
