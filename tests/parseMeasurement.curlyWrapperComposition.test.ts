import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions } from '../src';

// AFA-277: quotation marks cannot surround an entry, so a curly quotation around a height
// returns null, also with a selector or an introduction.
const cases: [string, ParseOptions][] = [
  ['“5’11””', {}],
  ['„5’11””', {}],
  ['”5’11””', {}],
  ['‘5’11’’’', {}],
  ['‚six’’', {}],
  ['„72””', {}],
  ['“five’ ten””', {}],
  ['“5’11” ”', {}],
  ['“5’11”  ”', {}],
  ['“72” ”', {}],
  ['“72””', {}],
  ['“5’11”” tall', {}],
  ['“5’11””.', {}],
  ['“5 ft 11””', {}],
  ['“5ft 11””', {}],
  ['“5’11”” ', {}],
  ['“ 5’11” ”', {}],
  ['about “5’11””', {}],
  ['“about 5’11””', {}],
  [
    '“5’11””, 70 kg',
    {
      type: 'height',
    },
  ],
  [
    '“5’11””',
    {
      normalizedUnit: 'cm',
    },
  ],
  ['“1””', {}],
];

describe('curly quotations around a height', () => {
  it.each(cases)('rejects %s with %j', (raw, options) => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });
});
