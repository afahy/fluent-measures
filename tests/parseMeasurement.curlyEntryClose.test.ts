import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions, type ParsedValue } from '../src';

// AFA-265: ticket arithmetic and one balanced entry wrapper; raw and written parts stay truthful.
// AFA-277: quotation marks and brackets cannot surround an entry, a measurement of a pair or a
// number. Each row with such a wrapper expects null.
const cases: [string, ParseOptions, ParsedValue | null][] = [
  ['“5’11””', {}, null],
  ['„5’11””', {}, null],
  ['”5’11””', {}, null],
  [
    '“5’11””',
    {
      type: 'height',
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '„5’11””',
    {
      type: 'height',
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '”5’11””',
    {
      type: 'height',
      normalizedUnit: 'cm',
    },
    null,
  ],
  ['“5’ 11””', {}, null],
  ['„5’ 11””', {}, null],
  ['”5’ 11””', {}, null],
  ['“5 ’11””', {}, null],
  ['„5 ’11””', {}, null],
  ['”5 ’11””', {}, null],
  ['“5 ’ 11””', {}, null],
  ['„5 ’ 11””', {}, null],
  ['”5 ’ 11””', {}, null],
  ['“five’10””', {}, null],
  ['„five’10””', {}, null],
  ['”five’10””', {}, null],
  ['“five’ ten””', {}, null],
  ['„five’ ten””', {}, null],
  ['”five’ ten””', {}, null],
  ['„72””', {}, null],
  ['”72””', {}, null],
  ['„5””', {}, null],
  ['”5””', {}, null],
  ['‘5’11’’’', {}, null],
  ['‚5’11’’’', {}, null],
  ['‚six’’', {}, null],
  ['„5 ft 11”', {}, null],
  [
    '„5 ft 11”',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  ['”5 ft 11”', {}, null],
  [
    '”5 ft 11”',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  ['“5’11”', {}, null],
  [
    '“5’11”',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  ['“5′11″”', {}, null],
  [
    '“5′11″”',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  ['"5\'11""', {}, null],
  [
    '"5\'11""',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  ['(5\'11")', {}, null],
  [
    '(5\'11")',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  ['[5’11”]', {}, null],
  [
    '[5’11”]',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
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
  ['"5\'11", 70 kg"', {}, null],
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
  ['"5\'11", 70 kg', {}, null],
  ['‘72’ kg', {}, null],
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
  ['“72””', {}, null],
  ['‘six’’', {}, null],
  ['“5 ft 11””', {}, null],
  ['“5’11” ”', {}, null],
  ['‚six’ ’', {}, null],
];

describe('curly unit before a matching entry close', () => {
  it.each(cases)('reads %s with %j', (raw, options, expected) => {
    expect(parseMeasurement(raw, options)).toEqual(expected);
  });
});
