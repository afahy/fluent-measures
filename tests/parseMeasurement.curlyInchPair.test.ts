import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions, type ParsedValue } from '../src';

// AFA-265: same matching-close suffix. The established digit-adjacency rule still applies
// to a paired inch mark (twoApostrophes.test.ts); an ordinary single mark allows whitespace.
// PARSING Surrounding Words permits one balanced wrapper and a height suffix tall.
// Feet and Inches supplies 5 * 12 + 11 = 71; scalar 5 in and 6 ft keep their values.
const cases: [string, ParseOptions, ParsedValue | null][] = [
  // PARSING forbids discarding a second explicit unit or an unknown fragment.
  ["‘11kg'’", {}, null],
  ['‘11’x’', {}, null],
  [
    '‘5 ft 11’’’',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '‘5 ft 11’’’',
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
    '‘5 foot 11’’’',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '‘5 foot 11’’’',
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
  ['‘5’11 ’’’', {}, null],
  [
    '“5 ””',
    {},
    {
      value: 5,
      unit: 'in',
      type: 'height',
      raw: '“5 ””',
      matches: [
        {
          value: 5,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '“5’11 ””',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '“5’11 ””',
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
    '‘6 ’’ tall',
    {},
    {
      value: 6,
      unit: 'ft',
      type: 'height',
      raw: '‘6 ’’ tall',
      matches: [
        {
          value: 6,
          unit: 'ft',
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
    '‚5 ft 11’’’',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '‚5 ft 11’’’',
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
    "‘5 ft 11’'’",
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: "‘5 ft 11’'’",
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
  ['‘5 ft 11 ’’’', {}, null],
  ['‘5 ft eleven’’’', {}, null],
  ['‘5 ft 12’’’', {}, null],
  ['‘5 ft -11’’’', {}, null],
  ['‘5 ft 11’’’ extra', {}, null],
  ['‘5 ft 11’’', {}, null],
  ['‘5 ft 11’’”', {}, null],
  ['‘5 ft 11’ ’’,', {}, null],
];

describe('paired curly inch suffix within its entry bound', () => {
  it.each(cases)('reads %s with %j', (raw, options, expected) => {
    expect(parseMeasurement(raw, options)).toEqual(expected);
  });
});
