// AFA-250: recovery expectations now follow the approved complete-entry contract in PARSING.md.
// Earlier ticket rationales below describe their historical extraction contract; original
// assertions are retained separately under design/afa-250.
import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

describe('units next to an omitted numeric range', () => {
  // AFA-170 option 1: the later number keeps its own unit.
  it.each([
    '150-180 lbs 70 kg',
    '1-2 ft 6 in',
    '50-70 kg, 180 lbs',
    'lbs 150-180 70 kg',
    'ft 1-2 6 in',
    'kg 50-70, 180 lbs',
    '150–180 pounds 70 kilograms',
    '150-180lbs 70kg',
    '72,5-80,5 kg, 180 lbs',
    '1,250-1,500 lbs, 70 kg',
    '1-2\' 6"',
    '1-2 metres 180 centimetres',
    '150-180 (lbs) 70 kg',
    '150-180 lbs 50-70 kg 80 lb',
    '150-180 lbs 400 g; actual 80 lb',
    '6 1-2 ft 3 cm',
    '6 1-2 cm 3 in',
    '6.5 1-2 ft 3 in',
    '6 1-2 ft 12 in',
    '(kg): 50-70, 180 lbs',
    'record 1-2; lbs 70 kg',
  ])('rejects the complete entry %s (AFA-250)', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it.each([
    '1-2 ft 6',
    'ft 1-2 6',
    '6 1-2 ft',
    // Two and a half is still a preceding number: the range's feet cannot attach to 3.
    'two and a half 1-2; ft 3',
    '1-2 inches 6',
    'kg 50-70 180',
    '6 1-2 ft text in',
    '6 1-2 ft in',
    'height 1-2 ft 6',
    '6 1-2; ft 3',
  ])('does not lend the range unit to an unqualified number in %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
    expect(parseMeasurement(raw, { type: 'height', defaultUnit: 'in' })).toBeNull();
    expect(parseMeasurement(raw, { type: 'weight', defaultUnit: 'lb' })).toBeNull();
  });

  // The maintainer asks for 6 ft + 3 in, without using a midpoint of the range.
  it.each([
    '6 1-2 ft 3 in',
    '6 1-2 ft: 3 in',
    '6 1-2 (ft) 3 in',
    'six 1–2 feet three inches',
    'six and 1-2 feet three inches',
    '6 1-2\'3"',
  ])('rejects the complete entry %s (AFA-250)', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it.each([
    '6ft1-2in',
    '6 ft 1-2 11 in',
    '6 ft 1-2 11',
    '6 ft 1-2 in 11',
    'record 1-2; kg 70',
    'weight - kg 70',
  ])('rejects the complete entry %s (AFA-250)', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  // Review regressions: a labeled field after a range still owns its following value.
  it.each([
    'age=20-30, kg=70',
    'age=20-30 kg=70',
    'age=20-30, (kg) 70',
    'age=20-30; kg=70',
    'age=20-30 & lbs:180',
    'age=20-30, in=72',
    'age=20-30, m=1.8',
  ])('rejects the complete entry %s (AFA-250)', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it('rejects a range followed by unsupported parts', () => {
    expect(parseMeasurement('age=20-30, kg=400 g, 80 lb')).toBeNull();
  });

  // AFA-93: a closing quote on number words is not a measurement mark, also across a range.
  it.each([
    '"1-2 twenty five"',
    "'1-2 twenty five'",
    'model "1-2 twenty five" 180',
    '"1-2 ten and a half"',
  ])('keeps the quoted number words in %s as nonmeasurements', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it('rejects quoted range text before a measurement', () => {
    expect(parseMeasurement('"1-2 twenty five"; 70 kg')).toBeNull();
  });

  // PARSING.md Semicolons permits punctuation between a number and its unit: 6 × 12 + 3 = 75.
  it.each([
    '6 1-2 ft 3;in',
    '6 1-2 ft 3;;in',
    '6 1-2 ft 3;inches',
    '6 1-2 ft; 3 in',
    '6 1-2 ft; 3;in',
    'six 1-2 feet three;inches',
    '6 1-2 ft 3;"',
  ])('rejects the complete entry %s (AFA-250)', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it.each(['6 1-2 ft 3;cm', '6 1-2 ft 12;in'])('rejects the complete entry %s (AFA-250)', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  // Confirmed failing-input probes. Explicit expected values follow option 1 and 6 × 12 + 3.
  it.each([
    ['6 1-2 ft; 3 in', {}],
    ['6 1-2 ft 3; in', {}],
    ['6 1-2; ft 3 in', {}],
    ['150-180; lbs 70 kg', {}],
    ['1-2; ft 6 in', {}],
    ['1-2; ft; 6 in', {}],
    ['50-70; kg, 180 lbs', {}],
    ['150-180;;; lbs 70 kg', {}],
    ['1-2; ft 6 in', { normalizedUnit: 'cm' }],
    ['150-180; poundz 70 kg', { fuzziness: 1 }],
    ['150-180; pounds seventy kilograms', {}],
    ['150–180; lbs 70 kg', {}],
  ] as const)('rejects the complete entry %s (AFA-250)', (raw, options) => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });

  it('does not attach a semicolon-separated range unit to a bare number', () => {
    expect(parseMeasurement('1-2; ft 6')).toBeNull();
  });

  it('does not join number words across a range for unqualified inference', () => {
    expect(
      parseMeasurement('twenty 1-2 five', {
        type: 'height',
        defaultUnit: 'in',
      })
    ).toBeNull();
    expect(
      parseMeasurement('twenty 1-2 five', {
        type: 'weight',
        defaultUnit: 'lb',
      })
    ).toBeNull();
  });

  // Re-review: a supported prefix already owns the number before the range.
  it.each([
    ['kg 70 1-2 ft 6 in', {}],
    ['kilograms seventy 1-2 ft 6 in', {}],
    ['lbs 150 1-2 ft 6 in', {}],
    ['kg; 70 1-2 ft 6 in', {}],
    ['kg: 70 1-2 ft 6 in', {}],
    ['(kg) 70 1-2 ft 6 in', {}],
    ['age=28, kg=70 1-2 ft 6 in', {}],
    ['record 0; kg 70 1-2 ft 6 in', {}],
    ['0 kg 6 1-2 ft 3 in', {}],
    ['kg 70 1-2; ft 6; in', {}],
    ['poundz 70 1-2 ft 6 in', { fuzziness: 1 }],
  ] as const)('rejects the complete entry %s (AFA-250)', (raw, options) => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });

  // AFA-250: these AFA-170 cases also relied on reconciliation. The complete-entry policy
  // retires them; other range recovery remains for the later AFA-250 slice.
  it('rejects independent recovered readings', () => {
    expect(parseMeasurement('5 ft 5 1-2 ft 0 in')).toBeNull();
    expect(parseMeasurement('inches 6 1-2 ft 6 in')).toBeNull();
    expect(parseMeasurement('0 ft 6 1-2 ft 3 in')).toBeNull();
  });

  // A prefix with its own earlier number leaves the candidate feet free. Bare short aliases
  // before a number are ordinary words; a signed weight does not claim a later height value.
  it.each([
    '5 kg 6 1-2 ft 3 in',
    'five and a half kg 6 1-2 ft 3 in',
    'in 6 1-2 ft 3 in',
    '-0 kg 6 1-2 ft 3 in',
    'kg and; 6 1-2 ft 3 in',
  ])('rejects the complete entry %s (AFA-250)', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it('rejects zero/range fragments across semicolons', () => {
    expect(parseMeasurement('ft six 1-2 ft 3 in')).toBeNull();
    expect(parseMeasurement('record 0; ft 12 1-2 ft 3 in')).toBeNull();
    expect(parseMeasurement('0 ft 70 1-2 ft 3 in')).toBeNull();
    expect(parseMeasurement('0 ft 12 1-2 ft 3 in')).toBeNull();
    expect(parseMeasurement('5 ft; 6 1-2 ft 0 in')).toBeNull();
    expect(parseMeasurement('5 ft 0 1-2 ft 3 in')).toBeNull();
  });

  // The label owns 72, so it is not the unit of the 3 before it.
  it.each([
    '6 1-2 ft 3, in=72',
    '6 1-2 ft 3 in=72',
    '6 1-2 ft 3; in=72',
    '6 1-2 ft 3, inches=72',
    '6 1-2 ft 3 (in) 72',
    '6 1-2 ft 3 in. 72',
  ])('rejects the complete entry %s (AFA-250)', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it('does not claim an independent inch field with no value', () => {
    expect(parseMeasurement('6 1-2 ft 3, in: height')).toBeNull();
  });

  it('rejects leftover labels after a range', () => {
    expect(parseMeasurement('6 1-2 ft 3 in=72 cm')).toBeNull();
  });

  it.each(['6 1-2 ft 3 (in)', '6 1-2 ft 3 in.', '6 1-2 ft 3 in: height'])(
    'rejects the complete entry %s (AFA-250)',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  it('rejects ranges even when their units match fuzzily', () => {
    expect(parseMeasurement('150-180 poundz 70 kg', { fuzziness: 1 })).toBeNull();
    expect(parseMeasurement('poundz 150-180 70 kg', { fuzziness: 1 })).toBeNull();
  });

  it('rejects range recovery even when normalization is requested', () => {
    expect(parseMeasurement('150-180 lbs 70 kg', { normalizedUnit: 'lb' })).toBeNull();
    expect(parseMeasurement('6 1-2 ft 3 in', { normalizedUnit: 'cm' })).toBeNull();
  });
});

// AFA-250: retain every original explicit selector/inference path when recovery becomes null.
it.each([
  ['150-180 lbs 70 kg', { type: 'height' }],
  ['150-180 lbs 70 kg', { type: 'weight' }],
  ['1-2 ft 6 in', { type: 'height' }],
  ['1-2 ft 6 in', { type: 'weight' }],
  ['50-70 kg, 180 lbs', { type: 'height' }],
  ['50-70 kg, 180 lbs', { type: 'weight' }],
  ['lbs 150-180 70 kg', { type: 'height' }],
  ['lbs 150-180 70 kg', { type: 'weight' }],
  ['ft 1-2 6 in', { type: 'height' }],
  ['ft 1-2 6 in', { type: 'weight' }],
  ['kg 50-70, 180 lbs', { type: 'height' }],
  ['kg 50-70, 180 lbs', { type: 'weight' }],
  ['150–180 pounds 70 kilograms', { type: 'height' }],
  ['150–180 pounds 70 kilograms', { type: 'weight' }],
  ['150-180lbs 70kg', { type: 'height' }],
  ['150-180lbs 70kg', { type: 'weight' }],
  ['72,5-80,5 kg, 180 lbs', { type: 'height' }],
  ['72,5-80,5 kg, 180 lbs', { type: 'weight' }],
  ['1,250-1,500 lbs, 70 kg', { type: 'height' }],
  ['1,250-1,500 lbs, 70 kg', { type: 'weight' }],
  ['1-2\' 6"', { type: 'height' }],
  ['1-2\' 6"', { type: 'weight' }],
  ['1-2 metres 180 centimetres', { type: 'height' }],
  ['1-2 metres 180 centimetres', { type: 'weight' }],
  ['150-180 (lbs) 70 kg', { type: 'height' }],
  ['150-180 (lbs) 70 kg', { type: 'weight' }],
  ['150-180 lbs 50-70 kg 80 lb', { type: 'height' }],
  ['150-180 lbs 50-70 kg 80 lb', { type: 'weight' }],
  ['150-180 lbs 400 g; actual 80 lb', { type: 'height' }],
  ['150-180 lbs 400 g; actual 80 lb', { type: 'weight' }],
  ['6 1-2 ft 3 cm', { type: 'height' }],
  ['6 1-2 ft 3 cm', { type: 'weight' }],
  ['6 1-2 cm 3 in', { type: 'height' }],
  ['6 1-2 cm 3 in', { type: 'weight' }],
  ['6.5 1-2 ft 3 in', { type: 'height' }],
  ['6.5 1-2 ft 3 in', { type: 'weight' }],
  ['6 1-2 ft 12 in', { type: 'height' }],
  ['6 1-2 ft 12 in', { type: 'weight' }],
  ['(kg): 50-70, 180 lbs', { type: 'height' }],
  ['(kg): 50-70, 180 lbs', { type: 'weight' }],
  ['record 1-2; lbs 70 kg', { type: 'height' }],
  ['record 1-2; lbs 70 kg', { type: 'weight' }],
  ['1-2 ft 6', { type: 'height', defaultUnit: 'in' }],
  ['1-2 ft 6', { type: 'weight', defaultUnit: 'lb' }],
  ['ft 1-2 6', { type: 'height', defaultUnit: 'in' }],
  ['ft 1-2 6', { type: 'weight', defaultUnit: 'lb' }],
  ['6 1-2 ft', { type: 'height', defaultUnit: 'in' }],
  ['6 1-2 ft', { type: 'weight', defaultUnit: 'lb' }],
  ['two and a half 1-2; ft 3', { type: 'height', defaultUnit: 'in' }],
  ['two and a half 1-2; ft 3', { type: 'weight', defaultUnit: 'lb' }],
  ['1-2 inches 6', { type: 'height', defaultUnit: 'in' }],
  ['1-2 inches 6', { type: 'weight', defaultUnit: 'lb' }],
  ['kg 50-70 180', { type: 'height', defaultUnit: 'in' }],
  ['kg 50-70 180', { type: 'weight', defaultUnit: 'lb' }],
  ['6 1-2 ft text in', { type: 'height', defaultUnit: 'in' }],
  ['6 1-2 ft text in', { type: 'weight', defaultUnit: 'lb' }],
  ['6 1-2 ft in', { type: 'height', defaultUnit: 'in' }],
  ['6 1-2 ft in', { type: 'weight', defaultUnit: 'lb' }],
  ['height 1-2 ft 6', { type: 'height', defaultUnit: 'in' }],
  ['height 1-2 ft 6', { type: 'weight', defaultUnit: 'lb' }],
  ['6 1-2; ft 3', { type: 'height', defaultUnit: 'in' }],
  ['6 1-2; ft 3', { type: 'weight', defaultUnit: 'lb' }],
  ['5 kg 6 1-2 ft 3 in', { type: 'height' }],
  ['five and a half kg 6 1-2 ft 3 in', { type: 'height' }],
  ['in 6 1-2 ft 3 in', { type: 'height' }],
  ['-0 kg 6 1-2 ft 3 in', { type: 'height' }],
  ['kg and; 6 1-2 ft 3 in', { type: 'height' }],
] as const)('rejects incomplete entry %s with original options %j', (raw, options) => {
  expect(parseMeasurement(raw, options)).toBeNull();
});
