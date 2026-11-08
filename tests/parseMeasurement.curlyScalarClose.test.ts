import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions, type ParsedValue } from '../src';

// AFA-266 owns selected curly pairs; the two pair controls preserve main null here.
// AFA-265 probe: a numeric feet mark and a distinct closing quote remain separate.
const cases: [string, ParseOptions, ParsedValue | null][] = [
  [
    '‘6’’',
    {},
    {
      value: 6,
      unit: 'ft',
      type: 'height',
      raw: '‘6’’',
      matches: [
        {
          value: 6,
          unit: 'ft',
        },
      ],
    },
  ],
  [
    '‘5.5’’',
    {},
    {
      value: 5.5,
      unit: 'ft',
      type: 'height',
      raw: '‘5.5’’',
      matches: [
        {
          value: 5.5,
          unit: 'ft',
        },
      ],
    },
  ],
  [
    '‘5½’’',
    {},
    {
      value: 5.5,
      unit: 'ft',
      type: 'height',
      raw: '‘5½’’',
      matches: [
        {
          value: 5.5,
          unit: 'ft',
        },
      ],
    },
  ],
  [
    '‘5 1/2’’',
    {},
    {
      value: 5.5,
      unit: 'ft',
      type: 'height',
      raw: '‘5 1/2’’',
      matches: [
        {
          value: 5.5,
          unit: 'ft',
        },
      ],
    },
  ],
  [
    '‘5,5’’',
    {},
    {
      value: 5.5,
      unit: 'ft',
      type: 'height',
      raw: '‘5,5’’',
      matches: [
        {
          value: 5.5,
          unit: 'ft',
        },
      ],
    },
  ],
  [
    '‘6’ ’',
    {},
    {
      value: 6,
      unit: 'ft',
      type: 'height',
      raw: '‘6’ ’',
      matches: [
        {
          value: 6,
          unit: 'ft',
        },
      ],
    },
  ],
  [
    '‘6’’',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 182.88,
      unit: 'cm',
      type: 'height',
      raw: '‘6’’',
      matches: [
        {
          value: 6,
          unit: 'ft',
        },
      ],
    },
  ],
  [
    '‚6’’',
    {},
    {
      value: 6,
      unit: 'ft',
      type: 'height',
      raw: '‚6’’',
      matches: [
        {
          value: 6,
          unit: 'ft',
        },
      ],
    },
  ],
  [
    '‚5.5’’',
    {},
    {
      value: 5.5,
      unit: 'ft',
      type: 'height',
      raw: '‚5.5’’',
      matches: [
        {
          value: 5.5,
          unit: 'ft',
        },
      ],
    },
  ],
  [
    '‚5½’’',
    {},
    {
      value: 5.5,
      unit: 'ft',
      type: 'height',
      raw: '‚5½’’',
      matches: [
        {
          value: 5.5,
          unit: 'ft',
        },
      ],
    },
  ],
  [
    '‚5 1/2’’',
    {},
    {
      value: 5.5,
      unit: 'ft',
      type: 'height',
      raw: '‚5 1/2’’',
      matches: [
        {
          value: 5.5,
          unit: 'ft',
        },
      ],
    },
  ],
  [
    '‚5,5’’',
    {},
    {
      value: 5.5,
      unit: 'ft',
      type: 'height',
      raw: '‚5,5’’',
      matches: [
        {
          value: 5.5,
          unit: 'ft',
        },
      ],
    },
  ],
  [
    '‚6’ ’',
    {},
    {
      value: 6,
      unit: 'ft',
      type: 'height',
      raw: '‚6’ ’',
      matches: [
        {
          value: 6,
          unit: 'ft',
        },
      ],
    },
  ],
  [
    '‚6’’',
    {
      normalizedUnit: 'cm',
    },
    {
      value: 182.88,
      unit: 'cm',
      type: 'height',
      raw: '‚6’’',
      matches: [
        {
          value: 6,
          unit: 'ft',
        },
      ],
    },
  ],
  [
    '‘6’’',
    {
      type: 'height',
      allowUnqualified: true,
      inferUnit: 'metric',
    },
    {
      value: 6,
      unit: 'ft',
      type: 'height',
      raw: '‘6’’',
      matches: [
        {
          value: 6,
          unit: 'ft',
        },
      ],
    },
  ],
  [
    '‘6’ ’',
    {},
    {
      value: 6,
      unit: 'ft',
      type: 'height',
      raw: '‘6’ ’',
      matches: [
        {
          value: 6,
          unit: 'ft',
        },
      ],
    },
  ],
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
