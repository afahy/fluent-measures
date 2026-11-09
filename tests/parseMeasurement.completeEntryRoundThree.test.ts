import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions, type MeasurementType, type Unit } from '../src';

// AFA-250 third review: independently frozen PARSING expectations and hand arithmetic.
// Preserve an earlier numeric failure boundary before a later conjunction; consume both parts.
// AFA-277: quotation marks and brackets cannot surround an entry, a measurement of a pair or a
// number. Each row with such a wrapper expects null.
type Expected = [number, Unit, MeasurementType, Array<[number, Unit]>];
const cases: Array<[string, ParseOptions, Expected | null]> = [
  [
    'ft five eleven and (70 kg)',
    {
      type: 'height',
    },
    null,
  ],
  [
    'ft five eleven and (70 kg)',
    {
      type: 'weight',
    },
    null,
  ],
  [
    'ft five eleven and (70 kg)',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    'ft five eleven and (70 kg)',
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  [
    'ft five eleven and weight 70 kg',
    {
      type: 'height',
    },
    [
      71,
      'in',
      'height',
      [
        [5, 'ft'],
        [11, 'in'],
      ],
    ],
  ],
  [
    'ft five eleven and weight 70 kg',
    {
      type: 'weight',
    },
    [70, 'kg', 'weight', [[70, 'kg']]],
  ],
  [
    'ft five eleven and weight 70 kg',
    {
      normalizedUnit: 'cm',
    },
    [
      180.34,
      'cm',
      'height',
      [
        [5, 'ft'],
        [11, 'in'],
      ],
    ],
  ],
  [
    'ft five eleven and weight 70 kg',
    {
      normalizedUnit: 'kg',
    },
    [70, 'kg', 'weight', [[70, 'kg']]],
  ],
  [
    'ft five eleven',
    {},
    [
      71,
      'in',
      'height',
      [
        [5, 'ft'],
        [11, 'in'],
      ],
    ],
  ],
  [
    'ft five eleven and 70 kg',
    {
      type: 'height',
    },
    [
      71,
      'in',
      'height',
      [
        [5, 'ft'],
        [11, 'in'],
      ],
    ],
  ],
  [
    'ft five eleven and 70 kg',
    {
      type: 'weight',
    },
    [70, 'kg', 'weight', [[70, 'kg']]],
  ],
  [
    'ft five and (70 kg)',
    {
      type: 'height',
    },
    null,
  ],
  [
    'ft five and weight 70 kg',
    {
      type: 'weight',
    },
    [70, 'kg', 'weight', [[70, 'kg']]],
  ],
  ['ft five eleven and (70 kg)', {}, null],
  ['ft five eleven and weight 70 kg', {}, null],
  [
    'ft five eleven and [70 kg]',
    {
      type: 'height',
    },
    null,
  ],
  [
    'ft five eleven and [70 kg]',
    {
      type: 'weight',
    },
    null,
  ],
  [
    'ft five eleven and [70 kg]',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    'ft five eleven and [70 kg]',
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  [
    'ft five eleven and my weight is 70 kg',
    {
      type: 'height',
    },
    [
      71,
      'in',
      'height',
      [
        [5, 'ft'],
        [11, 'in'],
      ],
    ],
  ],
  [
    'ft five eleven and my weight is 70 kg',
    {
      type: 'weight',
    },
    [70, 'kg', 'weight', [[70, 'kg']]],
  ],
  [
    'ft five eleven and my weight is 70 kg',
    {
      normalizedUnit: 'cm',
    },
    [
      180.34,
      'cm',
      'height',
      [
        [5, 'ft'],
        [11, 'in'],
      ],
    ],
  ],
  [
    'ft five eleven and my weight is 70 kg',
    {
      normalizedUnit: 'kg',
    },
    [70, 'kg', 'weight', [[70, 'kg']]],
  ],
  [
    'ft five eleven and about 70 kg',
    {
      type: 'height',
    },
    [
      71,
      'in',
      'height',
      [
        [5, 'ft'],
        [11, 'in'],
      ],
    ],
  ],
  [
    'ft five eleven and about 70 kg',
    {
      type: 'weight',
    },
    [70, 'kg', 'weight', [[70, 'kg']]],
  ],
  [
    'ft five eleven and about 70 kg',
    {
      normalizedUnit: 'cm',
    },
    [
      180.34,
      'cm',
      'height',
      [
        [5, 'ft'],
        [11, 'in'],
      ],
    ],
  ],
  [
    'ft five eleven and about 70 kg',
    {
      normalizedUnit: 'kg',
    },
    [70, 'kg', 'weight', [[70, 'kg']]],
  ],
  [
    'ft five eleven and (weight 70 kg)',
    {
      type: 'height',
    },
    null,
  ],
  [
    'ft five eleven and (weight 70 kg)',
    {
      type: 'weight',
    },
    null,
  ],
  [
    'ft five eleven and (weight 70 kg)',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    'ft five eleven and (weight 70 kg)',
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  [
    'ft five eleven and kg seventy',
    {
      type: 'height',
    },
    [
      71,
      'in',
      'height',
      [
        [5, 'ft'],
        [11, 'in'],
      ],
    ],
  ],
  [
    'ft five eleven and kg seventy',
    {
      type: 'weight',
    },
    [70, 'kg', 'weight', [[70, 'kg']]],
  ],
  [
    'ft five eleven and kg seventy',
    {
      normalizedUnit: 'cm',
    },
    [
      180.34,
      'cm',
      'height',
      [
        [5, 'ft'],
        [11, 'in'],
      ],
    ],
  ],
  [
    'ft five eleven and kg seventy',
    {
      normalizedUnit: 'kg',
    },
    [70, 'kg', 'weight', [[70, 'kg']]],
  ],
  [
    'ft five eleven and “70 kg”',
    {
      type: 'height',
    },
    null,
  ],
  [
    'ft five eleven and “70 kg”',
    {
      type: 'weight',
    },
    null,
  ],
  [
    'ft five eleven and “70 kg”',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    'ft five eleven and “70 kg”',
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  [
    'weight 70 kg and ft five eleven',
    {
      type: 'height',
    },
    [
      71,
      'in',
      'height',
      [
        [5, 'ft'],
        [11, 'in'],
      ],
    ],
  ],
  [
    'weight 70 kg and ft five eleven',
    {
      type: 'weight',
    },
    [70, 'kg', 'weight', [[70, 'kg']]],
  ],
  [
    'weight 70 kg and ft five eleven',
    {
      normalizedUnit: 'cm',
    },
    [
      180.34,
      'cm',
      'height',
      [
        [5, 'ft'],
        [11, 'in'],
      ],
    ],
  ],
  [
    'weight 70 kg and ft five eleven',
    {
      normalizedUnit: 'kg',
    },
    [70, 'kg', 'weight', [[70, 'kg']]],
  ],
  [
    '(70 kg) and ft five eleven',
    {
      type: 'height',
    },
    null,
  ],
  [
    '(70 kg) and ft five eleven',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '(70 kg) and ft five eleven',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '(70 kg) and ft five eleven',
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  [
    'ft 5 11 and weight 70 kg',
    {
      type: 'height',
    },
    [
      71,
      'in',
      'height',
      [
        [5, 'ft'],
        [11, 'in'],
      ],
    ],
  ],
  [
    'ft 5 11 and weight 70 kg',
    {
      type: 'weight',
    },
    [70, 'kg', 'weight', [[70, 'kg']]],
  ],
  [
    'ft 5 11 and weight 70 kg',
    {
      normalizedUnit: 'cm',
    },
    [
      180.34,
      'cm',
      'height',
      [
        [5, 'ft'],
        [11, 'in'],
      ],
    ],
  ],
  [
    'ft 5 11 and weight 70 kg',
    {
      normalizedUnit: 'kg',
    },
    [70, 'kg', 'weight', [[70, 'kg']]],
  ],
  [
    'five ft eleven and (70 kg)',
    {
      type: 'height',
    },
    null,
  ],
  [
    'five ft eleven and (70 kg)',
    {
      type: 'weight',
    },
    null,
  ],
  [
    'five ft eleven and (70 kg)',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    'five ft eleven and (70 kg)',
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  [
    'ft five eleven point five and weight 70 kg',
    {
      type: 'height',
    },
    [
      71.5,
      'in',
      'height',
      [
        [5, 'ft'],
        [11.5, 'in'],
      ],
    ],
  ],
  [
    'ft five eleven point five and weight 70 kg',
    {
      type: 'weight',
    },
    [70, 'kg', 'weight', [[70, 'kg']]],
  ],
  [
    'ft five eleven point five and weight 70 kg',
    {
      normalizedUnit: 'cm',
    },
    [
      181.61,
      'cm',
      'height',
      [
        [5, 'ft'],
        [11.5, 'in'],
      ],
    ],
  ],
  [
    'ft five eleven point five and weight 70 kg',
    {
      normalizedUnit: 'kg',
    },
    [70, 'kg', 'weight', [[70, 'kg']]],
  ],
  [
    'ft five eleven and a half and weight 70 kg',
    {
      type: 'height',
    },
    [
      71.5,
      'in',
      'height',
      [
        [5, 'ft'],
        [11.5, 'in'],
      ],
    ],
  ],
  [
    'ft five eleven and a half and weight 70 kg',
    {
      type: 'weight',
    },
    [70, 'kg', 'weight', [[70, 'kg']]],
  ],
  [
    'ft five eleven and a half and weight 70 kg',
    {
      normalizedUnit: 'cm',
    },
    [
      181.61,
      'cm',
      'height',
      [
        [5, 'ft'],
        [11.5, 'in'],
      ],
    ],
  ],
  [
    'ft five eleven and a half and weight 70 kg',
    {
      normalizedUnit: 'kg',
    },
    [70, 'kg', 'weight', [[70, 'kg']]],
  ],
  [
    'ft a hundred and five eleven and weight 70 kg',
    {
      type: 'height',
    },
    [
      1271,
      'in',
      'height',
      [
        [105, 'ft'],
        [11, 'in'],
      ],
    ],
  ],
  [
    'ft a hundred and five eleven and weight 70 kg',
    {
      type: 'weight',
    },
    [70, 'kg', 'weight', [[70, 'kg']]],
  ],
  [
    'ft a hundred and five eleven and weight 70 kg',
    {
      normalizedUnit: 'cm',
    },
    [
      3228.34,
      'cm',
      'height',
      [
        [105, 'ft'],
        [11, 'in'],
      ],
    ],
  ],
  [
    'ft a hundred and five eleven and weight 70 kg',
    {
      normalizedUnit: 'kg',
    },
    [70, 'kg', 'weight', [[70, 'kg']]],
  ],
  [
    'ft zero eleven and weight 70 kg',
    {
      type: 'height',
    },
    [
      11,
      'in',
      'height',
      [
        [0, 'ft'],
        [11, 'in'],
      ],
    ],
  ],
  [
    'ft zero eleven and weight 70 kg',
    {
      type: 'weight',
    },
    [70, 'kg', 'weight', [[70, 'kg']]],
  ],
  [
    'ft zero eleven and weight 70 kg',
    {
      normalizedUnit: 'cm',
    },
    [
      27.94,
      'cm',
      'height',
      [
        [0, 'ft'],
        [11, 'in'],
      ],
    ],
  ],
  [
    'ft zero eleven and weight 70 kg',
    {
      normalizedUnit: 'kg',
    },
    [70, 'kg', 'weight', [[70, 'kg']]],
  ],
  [
    'm: one 80 and weight 70 kg',
    {
      type: 'height',
    },
    [
      180,
      'cm',
      'height',
      [
        [1, 'm'],
        [80, 'cm'],
      ],
    ],
  ],
  [
    'm: one 80 and weight 70 kg',
    {
      type: 'weight',
    },
    [70, 'kg', 'weight', [[70, 'kg']]],
  ],
  [
    'm: one 80 and weight 70 kg',
    {
      normalizedUnit: 'cm',
    },
    [
      180,
      'cm',
      'height',
      [
        [1, 'm'],
        [80, 'cm'],
      ],
    ],
  ],
  [
    'm: one 80 and weight 70 kg',
    {
      normalizedUnit: 'kg',
    },
    [70, 'kg', 'weight', [[70, 'kg']]],
  ],
  [
    'm: one eighty and weight 70 kg',
    {
      type: 'height',
    },
    [180, 'm', 'height', [[180, 'm']]],
  ],
  [
    'm: one eighty and weight 70 kg',
    {
      type: 'weight',
    },
    [70, 'kg', 'weight', [[70, 'kg']]],
  ],
  [
    'm: one eighty and weight 70 kg',
    {
      normalizedUnit: 'cm',
    },
    [18000, 'cm', 'height', [[180, 'm']]],
  ],
  [
    'm: one eighty and weight 70 kg',
    {
      normalizedUnit: 'kg',
    },
    [70, 'kg', 'weight', [[70, 'kg']]],
  ],
  [
    'ft five and a half and weight 70 kg',
    {
      type: 'height',
    },
    [5.5, 'ft', 'height', [[5.5, 'ft']]],
  ],
  [
    'ft five and a half and weight 70 kg',
    {
      type: 'weight',
    },
    [70, 'kg', 'weight', [[70, 'kg']]],
  ],
  [
    'ft five and a half and weight 70 kg',
    {
      normalizedUnit: 'cm',
    },
    [167.64000000000001, 'cm', 'height', [[5.5, 'ft']]],
  ],
  [
    'ft five and a half and weight 70 kg',
    {
      normalizedUnit: 'kg',
    },
    [70, 'kg', 'weight', [[70, 'kg']]],
  ],
  [
    'ft five eleven and',
    {
      type: 'height',
    },
    null,
  ],
  [
    'ft five eleven and',
    {
      type: 'weight',
    },
    null,
  ],
  [
    'ft five eleven and and weight 70 kg',
    {
      type: 'height',
    },
    null,
  ],
  [
    'ft five eleven and and weight 70 kg',
    {
      type: 'weight',
    },
    null,
  ],
  [
    'ft five and and eleven and weight 70 kg',
    {
      type: 'height',
    },
    null,
  ],
  [
    'ft five and and eleven and weight 70 kg',
    {
      type: 'weight',
    },
    null,
  ],
  [
    'ft and five eleven and weight 70 kg',
    {
      type: 'height',
    },
    null,
  ],
  [
    'ft and five eleven and weight 70 kg',
    {
      type: 'weight',
    },
    null,
  ],
  [
    'ft five eleven and a half and and (70 kg)',
    {
      type: 'height',
    },
    null,
  ],
  [
    'ft five eleven and a half and and (70 kg)',
    {
      type: 'weight',
    },
    null,
  ],
  [
    'ft five eleven a half and weight 70 kg',
    {
      type: 'height',
    },
    null,
  ],
  [
    'ft five eleven a half and weight 70 kg',
    {
      type: 'weight',
    },
    null,
  ],
  [
    'ft five eleven and half and weight 70 kg',
    {
      type: 'height',
    },
    null,
  ],
  [
    'ft five eleven and half and weight 70 kg',
    {
      type: 'weight',
    },
    null,
  ],
  [
    'ft five eleven and a half thousand and weight 70 kg',
    {
      type: 'height',
    },
    null,
  ],
  [
    'ft five eleven and a half thousand and weight 70 kg',
    {
      type: 'weight',
    },
    null,
  ],
  [
    'ft five point five eleven and weight 70 kg',
    {
      type: 'height',
    },
    null,
  ],
  [
    'ft five point five eleven and weight 70 kg',
    {
      type: 'weight',
    },
    null,
  ],
  [
    'ft five twelve and weight 70 kg',
    {
      type: 'height',
    },
    null,
  ],
  [
    'ft five twelve and weight 70 kg',
    {
      type: 'weight',
    },
    null,
  ],
  [
    'ft five zero and weight 70 kg',
    {
      type: 'height',
    },
    null,
  ],
  [
    'ft five zero and weight 70 kg',
    {
      type: 'weight',
    },
    null,
  ],
  [
    'ft five -eleven and weight 70 kg',
    {
      type: 'height',
    },
    null,
  ],
  [
    'ft five -eleven and weight 70 kg',
    {
      type: 'weight',
    },
    null,
  ],
  [
    'ft five eleven and weight -70 kg',
    {
      type: 'height',
    },
    null,
  ],
  [
    'ft five eleven and weight -70 kg',
    {
      type: 'weight',
    },
    null,
  ],
  [
    'ft five eleven and weight zero kg',
    {
      type: 'height',
    },
    null,
  ],
  [
    'ft five eleven and weight zero kg',
    {
      type: 'weight',
    },
    null,
  ],
  [
    'ft five eleven and (70 st)',
    {
      type: 'height',
    },
    null,
  ],
  [
    'ft five eleven and (70 st)',
    {
      type: 'weight',
    },
    null,
  ],
  [
    'ft five eleven and unknown 70 kg',
    {
      type: 'height',
    },
    null,
  ],
  [
    'ft five eleven and unknown 70 kg',
    {
      type: 'weight',
    },
    null,
  ],
  [
    'ft five eleven and (70 kg',
    {
      type: 'height',
    },
    null,
  ],
  [
    'ft five eleven and (70 kg',
    {
      type: 'weight',
    },
    null,
  ],
  [
    'ft five eleven and (70 kg]',
    {
      type: 'height',
    },
    null,
  ],
  [
    'ft five eleven and (70 kg]',
    {
      type: 'weight',
    },
    null,
  ],
  [
    'ft five eleven and (70 cm)',
    {
      type: 'height',
    },
    null,
  ],
  [
    'ft five eleven and (70 cm)',
    {
      type: 'weight',
    },
    null,
  ],
  [
    'ft five eleven and weight 70 kg and 80 kg',
    {
      type: 'height',
    },
    null,
  ],
  [
    'ft five eleven and weight 70 kg and 80 kg',
    {
      type: 'weight',
    },
    null,
  ],
  [
    'ft a hundred and five eleven and and weight 70 kg',
    {
      type: 'height',
    },
    null,
  ],
  [
    'ft a hundred and five eleven and and weight 70 kg',
    {
      type: 'weight',
    },
    null,
  ],
  [
    'ft a hundred and and five eleven and weight 70 kg',
    {
      type: 'height',
    },
    null,
  ],
  [
    'ft a hundred and and five eleven and weight 70 kg',
    {
      type: 'weight',
    },
    null,
  ],
  [
    'ft five eleven and (70 kg) extra',
    {
      type: 'height',
    },
    null,
  ],
  [
    'ft five eleven and (70 kg) extra',
    {
      type: 'weight',
    },
    null,
  ],
  ['ft five eleven and [70 kg]', {}, null],
  ['ft five eleven and kg seventy', {}, null],
  ['ft five eleven and a half and weight 70 kg', {}, null],
  ['ft a hundred and five eleven and weight 70 kg', {}, null],
  ['ft a hundred and five', {}, [105, 'ft', 'height', [[105, 'ft']]]],
  ['ft five and a half', {}, [5.5, 'ft', 'height', [[5.5, 'ft']]]],
  ['pounds two and a half thousand', {}, [2500, 'lb', 'weight', [[2500, 'lb']]]],
  ['ft five and', {}, null],
  ['pounds six and a half and', {}, null],
  ['kg and seventy two', {}, null],
  ['kg seventy and and two', {}, null],
  ['ft a hundred and and five', {}, null],
  ['ft a half', {}, null],
  ['ft a hundred five eleven and a half and and weight 70 kg', {}, null],
];

describe('complete-entry earlier numeric boundary', () => {
  it.each([8, 16, 32])('rejects %i repeated tokens in the complete pair', count => {
    expect.hasAssertions();
    for (const raw of [
      `ft ${'1 '.repeat(count)}1 and weight 70 kg`,
      `ft five eleven ${'and '.repeat(count)}weight 70 kg`,
    ]) {
      expect(parseMeasurement(raw, { type: 'weight' })).toBeNull();
    }
  });
  it.each(cases)('%s with %o', (raw, options, expected) => {
    expect(parseMeasurement(raw, options)).toEqual(
      expected && {
        value: expected[0],
        unit: expected[1],
        type: expected[2],
        raw,
        matches: expected[3].map(([value, unit]) => ({ value, unit })),
      }
    );
  });
});
