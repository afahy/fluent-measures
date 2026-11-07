import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions, type MeasurementType, type Unit } from '../src';

// AFA-250 review: PARSING wrapper/prefix rules and hand arithmetic (12 in/ft, 100 cm/m).
// Expected tuples are [total, final unit, dimension, written [amount, unit] parts].
type Expected = [number, Unit, MeasurementType, Array<[number, Unit]>];
const cases: Array<[string, ParseOptions, Expected | null]> = [
  ['(180 cm).', {}, [180, 'cm', 'height', [[180, 'cm']]]],
  ['[180 cm].', {}, [180, 'cm', 'height', [[180, 'cm']]]],
  ['about (180 cm).', {}, [180, 'cm', 'height', [[180, 'cm']]]],
  ['about [180 cm].', {}, [180, 'cm', 'height', [[180, 'cm']]]],
  ['height (180 cm).', {}, [180, 'cm', 'height', [[180, 'cm']]]],
  ['"180 cm".', {}, [180, 'cm', 'height', [[180, 'cm']]]],
  ["'180 cm'.", {}, [180, 'cm', 'height', [[180, 'cm']]]],
  ['“180 cm”.', {}, [180, 'cm', 'height', [[180, 'cm']]]],
  ['‘180 cm’.', {}, [180, 'cm', 'height', [[180, 'cm']]]],
  ['(180 cm.)', {}, [180, 'cm', 'height', [[180, 'cm']]]],
  ['about (180 cm.)', {}, [180, 'cm', 'height', [[180, 'cm']]]],
  ['(180 cm)', {}, [180, 'cm', 'height', [[180, 'cm']]]],
  ['[180 cm]', {}, [180, 'cm', 'height', [[180, 'cm']]]],
  ['(70 kg).', {}, [70, 'kg', 'weight', [[70, 'kg']]]],
  ['about [70 kg].', {}, [70, 'kg', 'weight', [[70, 'kg']]]],
  ['weight (70 kg).', {}, [70, 'kg', 'weight', [[70, 'kg']]]],
  [
    'm: one and eighty cm',
    {},
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
    'm: one and eighty and five cm',
    {},
    [
      185,
      'cm',
      'height',
      [
        [1, 'm'],
        [85, 'cm'],
      ],
    ],
  ],
  [
    'm: one hundred and one and eighty cm',
    {},
    [
      10180,
      'cm',
      'height',
      [
        [101, 'm'],
        [80, 'cm'],
      ],
    ],
  ],
  [
    'm: one hundred and eighty cm',
    {},
    [
      10080,
      'cm',
      'height',
      [
        [100, 'm'],
        [80, 'cm'],
      ],
    ],
  ],
  [
    'meters one and eighty point five cm',
    {},
    [
      180.5,
      'cm',
      'height',
      [
        [1, 'm'],
        [80.5, 'cm'],
      ],
    ],
  ],
  [
    'm: one and point five cm',
    {},
    [
      100.5,
      'cm',
      'height',
      [
        [1, 'm'],
        [0.5, 'cm'],
      ],
    ],
  ],
  [
    'ft twenty and one in',
    {},
    [
      241,
      'in',
      'height',
      [
        [20, 'ft'],
        [1, 'in'],
      ],
    ],
  ],
  [
    'ft five and eleven in',
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
    'ft five and eleven point five in',
    {},
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
    'm: one and eighty (cm)',
    {},
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
    'm: one and eighty [cm]',
    {},
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
    'm: one and eighty centimetres',
    {},
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
    'm: one and "eighty" cm',
    {},
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
    'ft twenty and one "',
    {},
    [
      241,
      'in',
      'height',
      [
        [20, 'ft'],
        [1, 'in'],
      ],
    ],
  ],
  [
    'm: one and zero cm',
    {},
    [
      100,
      'cm',
      'height',
      [
        [1, 'm'],
        [0, 'cm'],
      ],
    ],
  ],
  [
    'm: zero and eighty cm',
    {},
    [
      80,
      'cm',
      'height',
      [
        [0, 'm'],
        [80, 'cm'],
      ],
    ],
  ],
  [
    'ft five and zero in',
    {},
    [
      60,
      'in',
      'height',
      [
        [5, 'ft'],
        [0, 'in'],
      ],
    ],
  ],
  [
    'ft zero and five in',
    {},
    [
      5,
      'in',
      'height',
      [
        [0, 'ft'],
        [5, 'in'],
      ],
    ],
  ],
  [
    '1 m and eighty cm',
    {},
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
    'm: one, eighty cm',
    {},
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
    '[5 ft (11 in)].',
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
    '(m: one and eighty cm).',
    {},
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
    'about [m: one and eighty cm].',
    {},
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
  ['kg seventy two', {}, [72, 'kg', 'weight', [[72, 'kg']]]],
  ['m: one point eight', {}, [1.8, 'm', 'height', [[1.8, 'm']]]],
  ['ft five', {}, [5, 'ft', 'height', [[5, 'ft']]]],
  ['m: one and eighty', {}, [180, 'm', 'height', [[180, 'm']]]],
  ['m: one hundred and eighty', {}, [180, 'm', 'height', [[180, 'm']]]],
  ['ft twenty and one', {}, [21, 'ft', 'height', [[21, 'ft']]]],
  ['"ft twenty and one"', {}, [21, 'ft', 'height', [[21, 'ft']]]],
  ["'ft twenty and one'", {}, [21, 'ft', 'height', [[21, 'ft']]]],
  ['pounds six and a half', {}, [6.5, 'lb', 'weight', [[6.5, 'lb']]]],
  ['pounds two and a half thousand', {}, [2500, 'lb', 'weight', [[2500, 'lb']]]],
  ['m: one and a half', {}, [1.5, 'm', 'height', [[1.5, 'm']]]],
  ['ft five and a half hundred', {}, [550, 'ft', 'height', [[550, 'ft']]]],
  ['kg seventy two.', {}, [72, 'kg', 'weight', [[72, 'kg']]]],
  ['180 cm.', {}, [180, 'cm', 'height', [[180, 'cm']]]],
  ['(180 cm, 70 kg).', { type: 'height' }, [180, 'cm', 'height', [[180, 'cm']]]],
  ['(180 cm, 70 kg).', { type: 'weight' }, [70, 'kg', 'weight', [[70, 'kg']]]],
  ['(180 cm, 70 kg).', { normalizedUnit: 'm' }, [1.8, 'm', 'height', [[180, 'cm']]]],
  ['(180 cm, 70 kg).', { normalizedUnit: 'kg' }, [70, 'kg', 'weight', [[70, 'kg']]]],
  ['(180 cm, 70 kg).', {}, null],
  ['[70 kg; 180 cm].', { type: 'height' }, [180, 'cm', 'height', [[180, 'cm']]]],
  ['[70 kg; 180 cm].', { type: 'weight' }, [70, 'kg', 'weight', [[70, 'kg']]]],
  ['[70 kg; 180 cm].', { normalizedUnit: 'm' }, [1.8, 'm', 'height', [[180, 'cm']]]],
  ['[70 kg; 180 cm].', { normalizedUnit: 'kg' }, [70, 'kg', 'weight', [[70, 'kg']]]],
  ['[70 kg; 180 cm].', {}, null],
  ['about (180 cm). and 70 kg', { type: 'height' }, [180, 'cm', 'height', [[180, 'cm']]]],
  ['about (180 cm). and 70 kg', { type: 'weight' }, [70, 'kg', 'weight', [[70, 'kg']]]],
  ['about (180 cm). and 70 kg', { normalizedUnit: 'm' }, [1.8, 'm', 'height', [[180, 'cm']]]],
  ['about (180 cm). and 70 kg', { normalizedUnit: 'kg' }, [70, 'kg', 'weight', [[70, 'kg']]]],
  ['about (180 cm). and 70 kg', {}, null],
  ['70 kg and about (180 cm).', { type: 'height' }, [180, 'cm', 'height', [[180, 'cm']]]],
  ['70 kg and about (180 cm).', { type: 'weight' }, [70, 'kg', 'weight', [[70, 'kg']]]],
  ['70 kg and about (180 cm).', { normalizedUnit: 'm' }, [1.8, 'm', 'height', [[180, 'cm']]]],
  ['70 kg and about (180 cm).', { normalizedUnit: 'kg' }, [70, 'kg', 'weight', [[70, 'kg']]]],
  ['70 kg and about (180 cm).', {}, null],
  [
    '[m: one and eighty cm; 70 kg].',
    { type: 'height' },
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
  ['[m: one and eighty cm; 70 kg].', { type: 'weight' }, [70, 'kg', 'weight', [[70, 'kg']]]],
  [
    '[m: one and eighty cm; 70 kg].',
    { normalizedUnit: 'm' },
    [
      1.8,
      'm',
      'height',
      [
        [1, 'm'],
        [80, 'cm'],
      ],
    ],
  ],
  ['[m: one and eighty cm; 70 kg].', { normalizedUnit: 'kg' }, [70, 'kg', 'weight', [[70, 'kg']]]],
  ['[m: one and eighty cm; 70 kg].', {}, null],
  [
    '70 kg and m: one and eighty cm',
    { type: 'height' },
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
  ['70 kg and m: one and eighty cm', { type: 'weight' }, [70, 'kg', 'weight', [[70, 'kg']]]],
  [
    '70 kg and m: one and eighty cm',
    { normalizedUnit: 'm' },
    [
      1.8,
      'm',
      'height',
      [
        [1, 'm'],
        [80, 'cm'],
      ],
    ],
  ],
  ['70 kg and m: one and eighty cm', { normalizedUnit: 'kg' }, [70, 'kg', 'weight', [[70, 'kg']]]],
  ['70 kg and m: one and eighty cm', {}, null],
  [
    'm: one and eighty cm and 70 kg',
    { type: 'height' },
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
  ['m: one and eighty cm and 70 kg', { type: 'weight' }, [70, 'kg', 'weight', [[70, 'kg']]]],
  [
    'm: one and eighty cm and 70 kg',
    { normalizedUnit: 'm' },
    [
      1.8,
      'm',
      'height',
      [
        [1, 'm'],
        [80, 'cm'],
      ],
    ],
  ],
  ['m: one and eighty cm and 70 kg', { normalizedUnit: 'kg' }, [70, 'kg', 'weight', [[70, 'kg']]]],
  ['m: one and eighty cm and 70 kg', {}, null],
  ['kg seventy two. and 181 cm', { type: 'weight' }, [72, 'kg', 'weight', [[72, 'kg']]]],
  ['(180 cm.).', {}, null],
  ['about (180 cm.).', {}, null],
  ['[180 cm.].', {}, null],
  ['about [180 cm.].', {}, null],
  ['(180 cm)..', {}, null],
  ['"180 cm.".', {}, null],
  ['(180 cm. .)', {}, null],
  ['(180 cm). .', {}, null],
  ['(180 cm].', {}, null],
  ['about [180 cm).', {}, null],
  ['((180 cm)).', {}, null],
  ['about ((180 cm)).', {}, null],
  ['(180 cm). noise', {}, null],
  ['(180 cm). 70 kg', {}, null],
  ['(180). cm', {}, null],
  ['about (around 180 cm).', {}, null],
  ['height (height 180 cm).', {}, null],
  ['m: one point five and eighty cm', {}, null],
  ['ft five and twelve in', {}, null],
  ['m: one and one hundred cm', {}, null],
  ['m: zero and zero cm', {}, null],
  ['m: one and -eighty cm', {}, null],
  ['m: one and −80 cm', {}, null],
  ['ft five and -11 in', {}, null],
  ['m: one and and eighty cm', {}, null],
  ['m: one and eighty and cm', {}, null],
  ['m: one and eighty mm', {}, null],
  ['m: one and eighty cm extra', {}, null],
  ['m: one and eighty kg', {}, null],
  ['ft five and zero', {}, null],
  ['m: one and zero', {}, null],
  ['m: one and eighty cm 70 kg', {}, null],
  ['6 1-2 ft 3 in', {}, null],
  ['70 kg (154 lbs)', {}, null],
  ['6 ft (72 in)', {}, null],
  ['Top 10 in the class', {}, null],
  ['weighed 70 kg in 2020', {}, null],
  ['age=28, kg=72', {}, null],
  ['(180 cm). and -70 kg', { type: 'height' }, null],
  ['(180 cm). and -70 kg', { type: 'weight' }, null],
  ['70 kg and m: one and -eighty cm', { type: 'height' }, null],
  ['70 kg and m: one and -eighty cm', { type: 'weight' }, null],
  ['[m: one and eighty cm; 0 kg].', { type: 'height' }, null],
  ['[m: one and eighty cm; 0 kg].', { type: 'weight' }, null],
  ['(72 kg).', {}, [72, 'kg', 'weight', [[72, 'kg']]]],
  ['[72 kg].', {}, [72, 'kg', 'weight', [[72, 'kg']]]],
  ['"72 kg".', {}, [72, 'kg', 'weight', [[72, 'kg']]]],
  ["'72 kg'.", {}, [72, 'kg', 'weight', [[72, 'kg']]]],
  ['“72 kg”.', {}, [72, 'kg', 'weight', [[72, 'kg']]]],
  ['‘72 kg’.', {}, [72, 'kg', 'weight', [[72, 'kg']]]],
  ['I weigh [72 kg].', {}, [72, 'kg', 'weight', [[72, 'kg']]]],
];

describe('complete-entry wrapper and prefix review regressions', () => {
  it.each(cases)('keeps the whole public result for %s with %j', (raw, options, expected) => {
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
