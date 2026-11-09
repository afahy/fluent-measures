import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions, type ParsedValue } from '../src';

// AFA-250: independently frozen balanced-wrapper/unit rules and hand arithmetic.
// AFA-277: quotation marks and brackets cannot surround an entry, a measurement of a pair or a
// number. Each row with such a wrapper expects null.
const cases: [string, ParseOptions, ParsedValue | null][] = [
  ['"5′11″"', {}, null],
  [
    '"5′11″"',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5′11″"',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  ['"5\'11""', {}, null],
  [
    '"5\'11""',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5\'11""',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  ['about "5′11″"', {}, null],
  [
    'about "5′11″"',
    {
      type: 'height',
    },
    null,
  ],
  [
    'about "5′11″"',
    {
      normalizedUnit: 'cm',
    },
    null,
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
  ['“5′11″”', {}, null],
  ['"5 ft 11"', {}, null],
  ['"5 ft 11 in"', {}, null],
  [
    '5\'11"',
    {},
    {
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '5\'11"',
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
  ['about “5′11″”', {}, null],
  ['"5′11″" extra', {}, null],
  ['"5′11″")', {}, null],
  ['"5′11″', {}, null],
  ['about "5′11″', {}, null],
  ['"5\'11"', {}, null],
  [
    '"5\'11"',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5\'11"',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  ['"5′11"', {}, null],
  [
    '"5′11"',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5′11"',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  ['"5ʹ11ʺ"', {}, null],
  [
    '"5ʹ11ʺ"',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5ʹ11ʺ"',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  ['"5 ′ 11 ″"', {}, null],
  [
    '"5 ′ 11 ″"',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5 ′ 11 ″"',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  ['about "5\'11""', {}, null],
  [
    'about "5\'11""',
    {
      type: 'height',
    },
    null,
  ],
  [
    'about "5\'11""',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  ['"five ft eleven""', {}, null],
  [
    '"five ft eleven""',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"five ft eleven""',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  ['"five′eleven″"', {}, null],
  [
    '"five′eleven″"',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"five′eleven″"',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  ['"ft five eleven"', {}, null],
  [
    '"ft five eleven"',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"ft five eleven"',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '“5′11″”',
    {
      type: 'height',
    },
    null,
  ],
  [
    '“5′11″”',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    'about “5′11″”',
    {
      type: 'height',
    },
    null,
  ],
  [
    'about “5′11″”',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  ["'5′11″'", {}, null],
  [
    "'5′11″'",
    {
      type: 'height',
    },
    null,
  ],
  [
    "'5′11″'",
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  ['“5\'11"”', {}, null],
  [
    '“5\'11"”',
    {
      type: 'height',
    },
    null,
  ],
  [
    '“5\'11"”',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  ['‘5’ 11″', {}, null],
  [
    '‘5’ 11″',
    {
      type: 'height',
    },
    null,
  ],
  [
    '‘5’ 11″',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  ['‘5’ 11ʺ', {}, null],
  [
    '‘5’ 11ʺ',
    {
      type: 'height',
    },
    null,
  ],
  [
    '‘5’ 11ʺ',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  ['‘five’ eleven″', {}, null],
  [
    '‘five’ eleven″',
    {
      type: 'height',
    },
    null,
  ],
  [
    '‘five’ eleven″',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  ['‘5’ ½″', {}, null],
  [
    '‘5’ ½″',
    {
      type: 'height',
    },
    null,
  ],
  [
    '‘5’ ½″',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  ['"5′11″" tall', {}, null],
  ['"5\'11"" tall', {}, null],
  ['"5′11″".', {}, null],
  ['about "5′11″" tall.', {}, null],
  ['height is "5′11″" tall .', {}, null],
  ['"5′11″ tall"', {}, null],
  ['"5\'11"" tall .', {}, null],
  ['"0′11″"', {}, null],
  ['"5′0″"', {}, null],
  ['"5′11.5″"', {}, null],
  ['"5′11½″"', {}, null],
  ['"5′ 10 and a half″"', {}, null],
  ['"5′ 10 1/2″"', {}, null],
  ['"6 ft, 1/2″"', {}, null],
  ['"72″"', {}, null],
  ['"72""', {}, null],
  [
    '72″',
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: '72″',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '72ʺ',
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: '72ʺ',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  ['"72" in', {}, null],
  ['“72” in', {}, null],
  ['"72" kg', {}, null],
  ['"kg 72"', {}, null],
  ['"72.5" kg', {}, null],
  [
    '″:72',
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: '″:72',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    'ʺ=72',
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: 'ʺ=72',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '(″) 72',
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: '(″) 72',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '[ʺ]:72',
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: '[ʺ]:72',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  ['"5′11″", 70 kg', {}, null],
  [
    '"5′11″", 70 kg',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5′11″", 70 kg',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"5′11″", 70 kg',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '"5′11″", 70 kg',
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  ['70 kg and "5′11″"', {}, null],
  [
    '70 kg and "5′11″"',
    {
      type: 'height',
    },
    null,
  ],
  [
    '70 kg and "5′11″"',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '70 kg and "5′11″"',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '70 kg and "5′11″"',
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  ['about "5′11″" and weight 70 kg', {}, null],
  [
    'about "5′11″" and weight 70 kg',
    {
      type: 'height',
    },
    null,
  ],
  [
    'about "5′11″" and weight 70 kg',
    {
      type: 'weight',
    },
    null,
  ],
  [
    'about "5′11″" and weight 70 kg',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    'about "5′11″" and weight 70 kg',
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  ['"5\'11"", "70 kg"', {}, null],
  [
    '"5\'11"", "70 kg"',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5\'11"", "70 kg"',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"5\'11"", "70 kg"',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '"5\'11"", "70 kg"',
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  ['"5′11″, 70 kg"', {}, null],
  [
    '"5′11″, 70 kg"',
    {
      type: 'height',
    },
    null,
  ],
  [
    '"5′11″, 70 kg"',
    {
      type: 'weight',
    },
    null,
  ],
  [
    '"5′11″, 70 kg"',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  [
    '"5′11″, 70 kg"',
    {
      normalizedUnit: 'kg',
    },
    null,
  ],
  ['"5ʹ11ʺ', {}, null],
  ['"5′11″”', {}, null],
  ['“5′11″"', {}, null],
  ['"72″', {}, null],
  ['about "72″', {}, null],
  ['"5′11″]', {}, null],
  ['[5′11″"', {}, null],
  ['about "5′11″, 70 kg', {}, null],
  ['"5′11″""', {}, null],
  ['"5\'11"""', {}, null],
  ['("5′11″")', {}, null],
  ['"(5′11″)"', {}, null],
  ['about "about 5′11″"', {}, null],
  ['"5′11″" 72', {}, null],
  ['"5′11″" in', {}, null],
  ['"72″" kg', {}, null],
  ['"5′11″" tall tall', {}, null],
  ['"5′11″" tall. .', {}, null],
  ['"5′11″.".', {}, null],
  ['"5′11″"..', {}, null],
  ['"5′0"', {}, null],
  ['"5′12″"', {}, null],
  ['"5.5′6″"', {}, null],
  ['"5′+11″"', {}, null],
  ['"−5′11″"', {}, null],
  ['"5′-11″"', {}, null],
  ['"5′eleven and″"', {}, null],
  ['"5′eleven and and one″"', {}, null],
  ['″72', {}, null],
  ['ʺ72', {}, null],
  ['″ seventy two', {}, null],
  ['"72"', {}, null],
  ['“72”', {}, null],
  ['0″1/2 kg', {}, null],
  ['72″1/2 kg', {}, null],
  ['72ʺ1⁄2 kg', {}, null],
  ['"5′11″/70 kg"', {}, null],
  ['"70 kg" tall', {}, null],
  ['"kg 72" tall.', {}, null],
  ["'5'11\"'", {}, null],
  ["'5′11″", {}, null],
  ["'5'11", {}, null],
  ["'5' eleven in'", {}, null],
  ["'5'11″' extra", {}, null],
  ["'5'11″''", {}, null],
  ["'5'-11″'", {}, null],
  ["'5' kg", {}, null],
  ["'5' in", {}, null],
  ["'5'", {}, null],
  ["'5' 11", {}, null],
  ["'5' 70 kg", {}, null],
  ["'5' 11 in", {}, null],
  ["'5′11′", {}, null],
  ["about '5′11′", {}, null],
  [
    '′:5',
    {},
    {
      value: 5,
      unit: 'ft',
      type: 'height',
      raw: '′:5',
      matches: [
        {
          value: 5,
          unit: 'ft',
        },
      ],
    },
  ],
  [
    '(′)5',
    {},
    {
      value: 5,
      unit: 'ft',
      type: 'height',
      raw: '(′)5',
      matches: [
        {
          value: 5,
          unit: 'ft',
        },
      ],
    },
  ],
  ['′5', {}, null],
  ['ʹ5', {}, null],
  ['´5', {}, null],
  ["'5´11´", {}, null],
  ["'5ʹ11ʹ", {}, null],
  [
    '72′′',
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: '72′′',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '72´´',
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: '72´´',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '72′’',
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: '72′’',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    '72’′',
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: '72’′',
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  ['′′5', {}, null],
  ['72′′′', {}, null],
  [
    '5′',
    {},
    {
      value: 5,
      unit: 'ft',
      type: 'height',
      raw: '5′',
      matches: [
        {
          value: 5,
          unit: 'ft',
        },
      ],
    },
  ],
  [
    '5ʹ',
    {},
    {
      value: 5,
      unit: 'ft',
      type: 'height',
      raw: '5ʹ',
      matches: [
        {
          value: 5,
          unit: 'ft',
        },
      ],
    },
  ],
  [
    '5´',
    {},
    {
      value: 5,
      unit: 'ft',
      type: 'height',
      raw: '5´',
      matches: [
        {
          value: 5,
          unit: 'ft',
        },
      ],
    },
  ],
  ['"5´11´´"', {}, null],
  ["'5´11´´'", {}, null],
  ['‘5′11″', {}, null],
  ['‘5ʹ 11ʺ', {}, null],
  ["'180 cm'.", {}, null],
  ["'72 kg'.", {}, null],
  ["'6′'", {}, null],
  ["'6´'", {}, null],
  ["'6ʹ'", {}, null],
  ['"6′"', {}, null],
  ["'6 ft'", {}, null],
  [
    '6′',
    {},
    {
      value: 6,
      unit: 'ft',
      type: 'height',
      raw: '6′',
      matches: [
        {
          value: 6,
          unit: 'ft',
        },
      ],
    },
  ],
  [
    "72′'",
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: "72′'",
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  [
    "72'′",
    {},
    {
      value: 72,
      unit: 'in',
      type: 'height',
      raw: "72'′",
      matches: [
        {
          value: 72,
          unit: 'in',
        },
      ],
    },
  ],
  ["72 ′'", {}, null],
  ["five′'", {}, null],
  ["72.′'", {}, null],
  ["72′''", {}, null],
  ["'72'′", {}, null],
  ["about '6′'", {}, null],
  ["'6′' tall.", {}, null],
  ["'6′", {}, null],
  ["72′ '", {}, null],
  ["72' ′", {}, null],
  ['"72′\'"', {}, null],
  ['"72\'′"', {}, null],
  ["'72′''", {}, null],
  ["'72'′'", {}, null],
  ["about '72′''", {}, null],
  ["about '72'′'", {}, null],
  ["'72′''.", {}, null],
  ["'72' ′", {}, null],
  ["'72′'", {}, null],
  ["'72′'''", {}, null],
  ["72′'1/2 kg", {}, null],
  ["'0.5′''", {}, null],
  ['"5 ft 11′\'"', {}, null],
  ['"5 ft 11\'′"', {}, null],
  ["'5 ft 11′''", {}, null],
  ["'5 ft 11'′'", {}, null],
  ["about '5 ft 11′''.", {}, null],
  ['‘5’ 11′′', {}, null],
  [
    '‘5’ 11′′',
    {
      type: 'height',
    },
    null,
  ],
  [
    '‘5’ 11′′',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  ['‘5’ 11´´', {}, null],
  [
    '‘5’ 11´´',
    {
      type: 'height',
    },
    null,
  ],
  [
    '‘5’ 11´´',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  ['‘5’ 11ʹʹ', {}, null],
  [
    '‘5’ 11ʹʹ',
    {
      type: 'height',
    },
    null,
  ],
  [
    '‘5’ 11ʹʹ',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  ["‘5’ 11′'", {}, null],
  [
    "‘5’ 11′'",
    {
      type: 'height',
    },
    null,
  ],
  [
    "‘5’ 11′'",
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  ["‘5’ 11'′", {}, null],
  [
    "‘5’ 11'′",
    {
      type: 'height',
    },
    null,
  ],
  [
    "‘5’ 11'′",
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  ["‘5’ 11''", {}, null],
  [
    "‘5’ 11''",
    {
      type: 'height',
    },
    null,
  ],
  [
    "‘5’ 11''",
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  ['‘5’ 11’’', {}, null],
  [
    '‘5’ 11’’',
    {
      type: 'height',
    },
    null,
  ],
  [
    '‘5’ 11’’',
    {
      normalizedUnit: 'cm',
    },
    null,
  ],
  ['‘5’ 11 ′′', {}, null],
  ['‘5’ eleven′′', {}, null],
  ['‘5’ 11′ ′', {}, null],
  ["‘5’ 11′ '", {}, null],
  ["‘5’ 11' ′", {}, null],
  ['‘5’ 11′′′', {}, null],
  ['‘5’ 11′′ tail', {}, null],
  ['‘5’ 12′′', {}, null],
  ['about ‘5’ 11′′', {}, null],
  ['‘5’ 11′′.', {}, null],
  ['‘5’ 11½′′', {}, null],
  ['‘5’ 11 1/2′′', {}, null],
];

describe('complete-entry quote and unit-mark boundaries', () => {
  it.each(cases)('reads the complete entry %s with %j', (raw, options, expected) => {
    expect(parseMeasurement(raw, options)).toEqual(expected);
  });
});
