import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions, type ParsedValue } from '../src';

// AFA-266 owns selected curly pairs; the two pair controls preserve main null here.
// AFA-265 probe: a numeric feet mark and a distinct closing quote remain separate.
// AFA-277: quotation marks and brackets cannot surround an entry, a measurement of a pair or a
// number. Each row with such a wrapper expects null.
const cases: [string, ParseOptions, ParsedValue | null][] = [
  ['‘6’’', {}, null],
  ['‘5.5’’', {}, null],
  ['‘5½’’', {}, null],
  ['‘5 1/2’’', {}, null],
  ['‘5,5’’', {}, null],
  ['‘6’ ’', {}, null],
  [
    '‘6’’',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  ['‚6’’', {}, null],
  ['‚5.5’’', {}, null],
  ['‚5½’’', {}, null],
  ['‚5 1/2’’', {}, null],
  ['‚5,5’’', {}, null],
  ['‚6’ ’', {}, null],
  [
    '‚6’’',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '‘6’’',
    {
      type: 'height',
      defaultUnit: 'cm',
    },
    null,
  ],
  ['‘6’ ’', {}, null],
  [
    '‘70 kg; 6’’',
    {
      type: 'height',
    },
    null,
  ],
  [
    '‘70 kg; 6’’',
    {
      type: 'weight',
    },
    null,
  ],
  ['‘6’’’ extra', {}, null],
  ['‚6’’ kg', {}, null],
  ['‘6’ ’ kg', {}, null],
  ['‘6’’’”', {}, null],
  ['‘6’', {}, null],
  ['‚6’', {}, null],
];
describe('numeric feet before a matching single-curly close', () => {
  it.each(cases)('reads %s with %j', (raw, options, expected) => {
    expect(parseMeasurement(raw, options)).toEqual(expected);
  });
});
