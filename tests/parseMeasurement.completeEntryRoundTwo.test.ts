import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions, type ParsedValue } from '../src';

// AFA-250: PARSING finite wrappers/marks/periods and hand arithmetic. Independent full-result
// oracles, including the approved dotted-unit correction, are retained in the external archive.
// AFA-277: quotation marks and brackets cannot surround an entry, a measurement of a pair or a
// number. Each row with such a wrapper expects null.
const cases: Array<{ raw: string; options?: ParseOptions; expected: ParsedValue | null }> = [
  {
    raw: '(180 cm) tall',
    options: {},
    expected: null,
  },
  {
    raw: 'height is (180 cm) tall',
    options: {},
    expected: null,
  },
  {
    raw: 'about (5 ft 11) tall',
    options: {},
    expected: null,
  },
  {
    raw: '“5 ft 11”',
    options: {},
    expected: null,
  },
  {
    raw: 'kg 72.5.',
    options: {},
    expected: {
      value: 72.5,
      unit: 'kg',
      type: 'weight',
      raw: 'kg 72.5.',
      matches: [
        {
          value: 72.5,
          unit: 'kg',
        },
      ],
    },
  },
  {
    raw: 'kg: ½.',
    options: {},
    expected: {
      value: 0.5,
      unit: 'kg',
      type: 'weight',
      raw: 'kg: ½.',
      matches: [
        {
          value: 0.5,
          unit: 'kg',
        },
      ],
    },
  },
  {
    raw: '180 cm tall',
    options: {},
    expected: {
      value: 180,
      unit: 'cm',
      type: 'height',
      raw: '180 cm tall',
      matches: [
        {
          value: 180,
          unit: 'cm',
        },
      ],
    },
  },
  {
    raw: '(180 cm).',
    options: {},
    expected: null,
  },
  {
    raw: '“5 ft 11 in”',
    options: {},
    expected: null,
  },
  {
    raw: '"5 ft 11"',
    options: {},
    expected: null,
  },
  {
    raw: 'kg 72.5 .',
    options: {},
    expected: {
      value: 72.5,
      unit: 'kg',
      type: 'weight',
      raw: 'kg 72.5 .',
      matches: [
        {
          value: 72.5,
          unit: 'kg',
        },
      ],
    },
  },
  {
    raw: 'kg: 0.5',
    options: {},
    expected: {
      value: 0.5,
      unit: 'kg',
      type: 'weight',
      raw: 'kg: 0.5',
      matches: [
        {
          value: 0.5,
          unit: 'kg',
        },
      ],
    },
  },
  {
    raw: '[180 cm] tall',
    options: {},
    expected: null,
  },
  {
    raw: 'height is [180 cm] tall.',
    options: {},
    expected: null,
  },
  {
    raw: 'about (180 cm) tall.',
    options: {},
    expected: null,
  },
  {
    raw: '(180 cm tall)',
    options: {},
    expected: null,
  },
  {
    raw: '(180 cm tall).',
    options: {},
    expected: null,
  },
  {
    raw: '"180 cm" tall',
    options: {},
    expected: null,
  },
  {
    raw: '‘180 cm’ tall',
    options: {},
    expected: null,
  },
  {
    raw: 'approximately [180 cm] tall',
    options: {},
    expected: null,
  },
  {
    raw: '(180 cm) tall.',
    options: {},
    expected: null,
  },
  {
    raw: '“5 ft 11” tall',
    options: {},
    expected: null,
  },
  {
    raw: 'height “5 ft 11” tall',
    options: {},
    expected: null,
  },
  {
    raw: '(5 ft (11 in)) tall',
    options: {},
    expected: null,
  },
  {
    raw: 'about [5 ft 11] tall.',
    options: {},
    expected: null,
  },
  {
    raw: "'1 m 80' tall",
    options: {},
    expected: null,
  },
  {
    raw: 'my height is around [1 m 80] tall',
    options: {},
    expected: null,
  },
  {
    raw: '(180 cm tall) tall',
    options: {},
    expected: null,
  },
  {
    raw: '(180 cm tall.) tall',
    options: {},
    expected: null,
  },
  {
    raw: '(180 cm.) tall',
    options: {},
    expected: null,
  },
  {
    raw: '(180 cm) tall..',
    options: {},
    expected: null,
  },
  {
    raw: '(70 kg) tall',
    options: {},
    expected: null,
  },
  {
    raw: '(70 kg) tall.',
    options: {},
    expected: null,
  },
  {
    raw: 'height (height 180 cm) tall',
    options: {},
    expected: null,
  },
  {
    raw: 'about (around 180 cm) tall',
    options: {},
    expected: null,
  },
  {
    raw: '((180 cm)) tall',
    options: {},
    expected: null,
  },
  {
    raw: '[180 cm) tall',
    options: {},
    expected: null,
  },
  {
    raw: '(180 cm] tall',
    options: {},
    expected: null,
  },
  {
    raw: '(180 cm) tall noise',
    options: {},
    expected: null,
  },
  {
    raw: '(180 cm) tall tall',
    options: {},
    expected: null,
  },
  {
    raw: '(180 cm) tall. tall',
    options: {},
    expected: null,
  },
  {
    raw: 'weight (180 cm) tall',
    options: {},
    expected: null,
  },
  {
    raw: 'about (180 cm tall) tall',
    options: {},
    expected: null,
  },
  {
    raw: 'about (180 cm.).',
    options: {},
    expected: null,
  },
  {
    raw: '(180 cm) . tall',
    options: {},
    expected: null,
  },
  {
    raw: '‘5 ft 11’',
    options: {},
    expected: null,
  },
  {
    raw: '“5 ft 11”.',
    options: {},
    expected: null,
  },
  {
    raw: '‘5 ft 11’.',
    options: {},
    expected: null,
  },
  {
    raw: '“5 feet eleven”',
    options: {},
    expected: null,
  },
  {
    raw: '“5 ft 11.5”',
    options: {},
    expected: null,
  },
  {
    raw: '“1 m 80”',
    options: {},
    expected: null,
  },
  {
    raw: '‘1 m 80’',
    options: {},
    expected: null,
  },
  {
    raw: '“1 meter eighty”',
    options: {},
    expected: null,
  },
  {
    raw: '“kg 72.5”',
    options: {},
    expected: null,
  },
  {
    raw: '‘kg 72.5’',
    options: {},
    expected: null,
  },
  {
    raw: '“5” ft',
    options: {},
    expected: null,
  },
  {
    raw: '‘5’ 11”',
    options: {},
    expected: null,
  },
  {
    raw: '5’11”',
    options: {},
    expected: {
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
  },
  {
    raw: '5′11″',
    options: {},
    expected: {
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
  },
  {
    raw: '‘5’11”’',
    options: {},
    expected: null,
  },
  {
    raw: "“5 ft 11'",
    options: {},
    expected: null,
  },
  {
    raw: '‘5 ft 11"',
    options: {},
    expected: null,
  },
  {
    raw: '“5 ft 11’',
    options: {},
    expected: null,
  },
  {
    raw: '‘5 ft 11”',
    options: {},
    expected: null,
  },
  {
    raw: '“5 ft 11',
    options: {},
    expected: null,
  },
  {
    raw: '5 ft 11””',
    options: {},
    expected: null,
  },
  {
    raw: '““5 ft 11””',
    options: {},
    expected: null,
  },
  {
    raw: '‘“5 ft 11”’',
    options: {},
    expected: null,
  },
  {
    raw: '“5 ft 11” in',
    options: {},
    expected: null,
  },
  {
    raw: '“5 ft 11” kg',
    options: {},
    expected: null,
  },
  {
    raw: '“72”60 cm',
    options: {},
    expected: null,
  },
  {
    raw: '“72” 60 inches',
    options: {},
    expected: null,
  },
  {
    raw: '“−5 ft 11”',
    options: {},
    expected: null,
  },
  {
    raw: '“5 ft 11” extra',
    options: {},
    expected: null,
  },
  {
    raw: '“5 ft 11”..',
    options: {},
    expected: null,
  },
  {
    raw: 'kg .5.',
    options: {},
    expected: {
      value: 0.5,
      unit: 'kg',
      type: 'weight',
      raw: 'kg .5.',
      matches: [
        {
          value: 0.5,
          unit: 'kg',
        },
      ],
    },
  },
  {
    raw: 'kg: 1/2.',
    options: {},
    expected: {
      value: 0.5,
      unit: 'kg',
      type: 'weight',
      raw: 'kg: 1/2.',
      matches: [
        {
          value: 0.5,
          unit: 'kg',
        },
      ],
    },
  },
  {
    raw: 'pounds 6½.',
    options: {},
    expected: {
      value: 6.5,
      unit: 'lb',
      type: 'weight',
      raw: 'pounds 6½.',
      matches: [
        {
          value: 6.5,
          unit: 'lb',
        },
      ],
    },
  },
  {
    raw: 'm: 1.8.',
    options: {},
    expected: {
      value: 1.8,
      unit: 'm',
      type: 'height',
      raw: 'm: 1.8.',
      matches: [
        {
          value: 1.8,
          unit: 'm',
        },
      ],
    },
  },
  {
    raw: 'in: 72.5.',
    options: {},
    expected: {
      value: 72.5,
      unit: 'in',
      type: 'height',
      raw: 'in: 72.5.',
      matches: [
        {
          value: 72.5,
          unit: 'in',
        },
      ],
    },
  },
  {
    raw: 'ft 5.5.',
    options: {},
    expected: {
      value: 5.5,
      unit: 'ft',
      type: 'height',
      raw: 'ft 5.5.',
      matches: [
        {
          value: 5.5,
          unit: 'ft',
        },
      ],
    },
  },
  {
    raw: 'kg 72.',
    options: {},
    expected: {
      value: 72,
      unit: 'kg',
      type: 'weight',
      raw: 'kg 72.',
      matches: [
        {
          value: 72,
          unit: 'kg',
        },
      ],
    },
  },
  {
    raw: '72. kg',
    options: {},
    expected: {
      value: 72,
      unit: 'kg',
      type: 'weight',
      raw: '72. kg',
      matches: [
        {
          value: 72,
          unit: 'kg',
        },
      ],
    },
  },
  {
    raw: '72.5 kg.',
    options: {},
    expected: {
      value: 72.5,
      unit: 'kg',
      type: 'weight',
      raw: '72.5 kg.',
      matches: [
        {
          value: 72.5,
          unit: 'kg',
        },
      ],
    },
  },
  {
    raw: 'kg: ¼.',
    options: {},
    expected: {
      value: 0.25,
      unit: 'kg',
      type: 'weight',
      raw: 'kg: ¼.',
      matches: [
        {
          value: 0.25,
          unit: 'kg',
        },
      ],
    },
  },
  {
    raw: 'kg: 2½.',
    options: {},
    expected: {
      value: 2.5,
      unit: 'kg',
      type: 'weight',
      raw: 'kg: 2½.',
      matches: [
        {
          value: 2.5,
          unit: 'kg',
        },
      ],
    },
  },
  {
    raw: 'kg: 0.5.',
    options: {},
    expected: {
      value: 0.5,
      unit: 'kg',
      type: 'weight',
      raw: 'kg: 0.5.',
      matches: [
        {
          value: 0.5,
          unit: 'kg',
        },
      ],
    },
  },
  {
    raw: 'kg seventy two.',
    options: {},
    expected: {
      value: 72,
      unit: 'kg',
      type: 'weight',
      raw: 'kg seventy two.',
      matches: [
        {
          value: 72,
          unit: 'kg',
        },
      ],
    },
  },
  {
    raw: 'kg: 0.5 .',
    options: {},
    expected: {
      value: 0.5,
      unit: 'kg',
      type: 'weight',
      raw: 'kg: 0.5 .',
      matches: [
        {
          value: 0.5,
          unit: 'kg',
        },
      ],
    },
  },
  {
    raw: 'kg 72..',
    options: {},
    expected: null,
  },
  {
    raw: '72.5. kg',
    options: {},
    expected: null,
  },
  {
    raw: 'kg 72.5..',
    options: {},
    expected: null,
  },
  {
    raw: 'kg 72.5...',
    options: {},
    expected: null,
  },
  {
    raw: 'kg 72..5.',
    options: {},
    expected: null,
  },
  {
    raw: 'kg .5..',
    options: {},
    expected: null,
  },
  {
    raw: 'kg: ½..',
    options: {},
    expected: null,
  },
  {
    raw: 'kg: 1/2..',
    options: {},
    expected: null,
  },
  {
    raw: 'kg 72.5.x',
    options: {},
    expected: null,
  },
  {
    raw: 'kg 72.5. 70 lb',
    options: {},
    expected: null,
  },
  {
    raw: 'kg -.5.',
    options: {},
    expected: null,
  },
  {
    raw: 'kg 0.5.5.',
    options: {},
    expected: null,
  },
  {
    raw: 'kg: 1/0.',
    options: {},
    expected: null,
  },
  {
    raw: 'kg: 1/2.5.',
    options: {},
    expected: null,
  },
  {
    raw: 'kg: ½.5.',
    options: {},
    expected: null,
  },
  {
    raw: 'kg: .',
    options: {},
    expected: null,
  },
  {
    raw: '.5. in',
    options: {},
    expected: null,
  },
  {
    raw: 'kg 72.5.. and 180 cm',
    options: {},
    expected: null,
  },
  {
    raw: '“5 ft 11” tall and kg 72.5.',
    options: {
      type: 'height',
    },
    expected: null,
  },
  {
    raw: '“5 ft 11” tall and kg 72.5.',
    options: {
      normalizedUnit: 'cm',
    },
    expected: null,
  },
  {
    raw: '“5 ft 11” tall and kg 72.5.',
    options: {
      type: 'weight',
    },
    expected: null,
  },
  {
    raw: '“5 ft 11” tall and kg 72.5.',
    options: {
      normalizedUnit: 'kg',
    },
    expected: null,
  },
  {
    raw: '“5 ft 11” tall and kg 72.5.',
    options: {},
    expected: null,
  },
  {
    raw: 'kg 72.5. and “5 ft 11” tall',
    options: {
      type: 'height',
    },
    expected: null,
  },
  {
    raw: 'kg 72.5. and “5 ft 11” tall',
    options: {
      normalizedUnit: 'cm',
    },
    expected: null,
  },
  {
    raw: 'kg 72.5. and “5 ft 11” tall',
    options: {
      type: 'weight',
    },
    expected: null,
  },
  {
    raw: 'kg 72.5. and “5 ft 11” tall',
    options: {
      normalizedUnit: 'kg',
    },
    expected: null,
  },
  {
    raw: 'kg 72.5. and “5 ft 11” tall',
    options: {},
    expected: null,
  },
  {
    raw: '(180 cm) tall; kg: ½.',
    options: {
      type: 'height',
    },
    expected: null,
  },
  {
    raw: '(180 cm) tall; kg: ½.',
    options: {
      normalizedUnit: 'm',
    },
    expected: null,
  },
  {
    raw: '(180 cm) tall; kg: ½.',
    options: {
      type: 'weight',
    },
    expected: null,
  },
  {
    raw: '(180 cm) tall; kg: ½.',
    options: {
      normalizedUnit: 'kg',
    },
    expected: null,
  },
  {
    raw: '(180 cm) tall; kg: ½.',
    options: {},
    expected: null,
  },
  {
    raw: 'kg: ½.; (180 cm) tall',
    options: {
      type: 'height',
    },
    expected: null,
  },
  {
    raw: 'kg: ½.; (180 cm) tall',
    options: {
      normalizedUnit: 'm',
    },
    expected: null,
  },
  {
    raw: 'kg: ½.; (180 cm) tall',
    options: {
      type: 'weight',
    },
    expected: null,
  },
  {
    raw: 'kg: ½.; (180 cm) tall',
    options: {
      normalizedUnit: 'kg',
    },
    expected: null,
  },
  {
    raw: 'kg: ½.; (180 cm) tall',
    options: {},
    expected: null,
  },
  {
    raw: '(180 cm) tall and -70 kg',
    options: {
      type: 'height',
    },
    expected: null,
  },
  {
    raw: '(180 cm) tall and -70 kg',
    options: {
      type: 'weight',
    },
    expected: null,
  },
  {
    raw: '(70 kg) tall and 180 cm',
    options: {
      type: 'height',
    },
    expected: null,
  },
  {
    raw: '(70 kg) tall and 180 cm',
    options: {
      type: 'weight',
    },
    expected: null,
  },
  {
    raw: '“5 ft 11” tall and kg 72.5..',
    options: {
      type: 'height',
    },
    expected: null,
  },
  {
    raw: '“5 ft 11” tall and kg 72.5..',
    options: {
      type: 'weight',
    },
    expected: null,
  },
  {
    raw: 'ft:5,−11in',
    options: {},
    expected: {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: 'ft:5,−11in',
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
  },
  {
    raw: '(m.)1,﹣80cm',
    options: {},
    expected: {
      value: 180,
      unit: 'cm',
      type: 'height',
      raw: '(m.)1,﹣80cm',
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
  },
  {
    raw: '5ft11',
    options: {},
    expected: {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '5ft11',
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
  },
  {
    raw: '1m80,5',
    options: {},
    expected: {
      value: 180.5,
      unit: 'cm',
      type: 'height',
      raw: '1m80,5',
      matches: [
        {
          value: 1,
          unit: 'm',
        },
        {
          value: 80.5,
          unit: 'cm',
        },
      ],
    },
  },
  {
    raw: 'ft:5,-11in',
    options: {},
    expected: null,
  },
  {
    raw: 'm:1,-80cm',
    options: {},
    expected: null,
  },
  {
    raw: '5 ft; −11 in',
    options: {},
    expected: null,
  },
  {
    raw: 'm: 1; −80 cm',
    options: {},
    expected: null,
  },
  {
    raw: 'my height is (181 cm) tall',
    options: {},
    expected: null,
  },
  {
    raw: 'I am “six feet” tall.',
    options: {},
    expected: null,
  },
  {
    raw: '72 in. tall',
    options: {},
    expected: {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: '72 in. tall',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  },
  {
    raw: '(72 in.) tall',
    options: {},
    expected: null,
  },
  {
    raw: '(180 cm .) tall',
    options: {},
    expected: null,
  },
  {
    raw: '(180 cm.).',
    options: {},
    expected: null,
  },
  {
    raw: '(180 cm.) tall.',
    options: {},
    expected: null,
  },
  {
    raw: '72 in. tall.',
    options: {},
    expected: {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: '72 in. tall.',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  },
  {
    raw: '(72 in. tall) tall',
    options: {},
    expected: null,
  },
  {
    raw: '(72 in. tall.) tall',
    options: {},
    expected: null,
  },
  {
    raw: '(70 kg.) tall',
    options: {},
    expected: null,
  },
  {
    raw: '(72 in.) tall .',
    options: {},
    expected: null,
  },
  {
    raw: '(72 in.) tall. .',
    options: {},
    expected: null,
  },
];

describe('complete-entry second-review boundaries', () => {
  it('rejects a period between the decimal number and its unit', () => {
    expect(parseMeasurement('5.5. ft')).toBeNull();
  });
  it('rejects a second standalone period after the outer height suffix', () => {
    expect(parseMeasurement('(72 in.) tall . .')).toBeNull();
  });
  it.each(cases)(
    'preserves the full result for $raw with $options',
    ({ raw, options, expected }) => {
      expect(parseMeasurement(raw, options)).toEqual(expected);
    }
  );
});
