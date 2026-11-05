import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

describe('units next to an omitted numeric range', () => {
  // AFA-170 option 1: the later number keeps its own unit.
  it.each([
    ['150-180 lbs 70 kg', 70, 'kg', 'weight'],
    ['1-2 ft 6 in', 6, 'in', 'height'],
    ['50-70 kg, 180 lbs', 180, 'lb', 'weight'],
    ['lbs 150-180 70 kg', 70, 'kg', 'weight'],
    ['ft 1-2 6 in', 6, 'in', 'height'],
    ['kg 50-70, 180 lbs', 180, 'lb', 'weight'],
    ['150–180 pounds 70 kilograms', 70, 'kg', 'weight'],
    ['150-180lbs 70kg', 70, 'kg', 'weight'],
    ['72,5-80,5 kg, 180 lbs', 180, 'lb', 'weight'],
    ['1,250-1,500 lbs, 70 kg', 70, 'kg', 'weight'],
    ['1-2\' 6"', 6, 'in', 'height'],
    ['1-2 metres 180 centimetres', 180, 'cm', 'height'],
    ['150-180 (lbs) 70 kg', 70, 'kg', 'weight'],
    ['150-180 lbs 50-70 kg 80 lb', 80, 'lb', 'weight'],
    ['150-180 lbs 400 g; actual 80 lb', 80, 'lb', 'weight'],
    ['6 1-2 ft 3 cm', 3, 'cm', 'height'],
    ['6 1-2 cm 3 in', 3, 'in', 'height'],
    ['6.5 1-2 ft 3 in', 3, 'in', 'height'],
    ['6 1-2 ft 12 in', 12, 'in', 'height'],
    ['(kg): 50-70, 180 lbs', 180, 'lb', 'weight'],
    ['record 1-2; lbs 70 kg', 70, 'kg', 'weight'],
  ] as const)('keeps the separate measurement in %s', (raw, value, unit, type) => {
    expect(parseMeasurement(raw)).toEqual({ value, unit, type, raw, matches: [{ value, unit }] });
    expect(parseMeasurement(raw, { type })).toEqual({
      value,
      unit,
      type,
      raw,
      matches: [{ value, unit }],
    });
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
    expect(parseMeasurement(raw, { type: 'height', allowUnqualified: true })).toBeNull();
    expect(parseMeasurement(raw, { type: 'weight', allowUnqualified: true })).toBeNull();
  });

  // The maintainer asks for 6 ft + 3 in, without using a midpoint of the range.
  it.each([
    '6 1-2 ft 3 in',
    '6 1-2 ft: 3 in',
    '6 1-2 (ft) 3 in',
    'six 1–2 feet three inches',
    'six and 1-2 feet three inches',
    '6 1-2\'3"',
  ])('keeps both parts of the surrounding feet and inches in %s', raw => {
    expect(parseMeasurement(raw)).toEqual({
      value: 75,
      unit: 'in',
      type: 'height',
      raw,
      matches: [
        { value: 6, unit: 'ft' },
        { value: 3, unit: 'in' },
      ],
    });
  });

  it.each([
    ['6ft1-2in', 6, 'ft'],
    ['6 ft 1-2 11 in', 83, 'in'],
    ['6 ft 1-2 11', 6, 'ft'],
    ['6 ft 1-2 in 11', 6, 'ft'],
    ['record 1-2; kg 70', 70, 'kg'],
    ['weight - kg 70', 70, 'kg'],
  ] as const)('preserves a measurement that owns its unit in %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit });
  });

  // Review regressions: a labeled field after a range still owns its following value.
  it.each([
    ['age=20-30, kg=70', 70, 'kg', 'weight'],
    ['age=20-30 kg=70', 70, 'kg', 'weight'],
    ['age=20-30, (kg) 70', 70, 'kg', 'weight'],
    ['age=20-30; kg=70', 70, 'kg', 'weight'],
    ['age=20-30 & lbs:180', 180, 'lb', 'weight'],
    ['age=20-30, in=72', 72, 'in', 'height'],
    ['age=20-30, m=1.8', 1.8, 'm', 'height'],
  ] as const)('preserves the separate labeled field in %s', (raw, value, unit, type) => {
    expect(parseMeasurement(raw)).toEqual({ value, unit, type, raw, matches: [{ value, unit }] });
  });

  it('retains a labeled unsupported weight part after a range', () => {
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

  it('keeps a measurement after quoted text containing a range', () => {
    expect(parseMeasurement('"1-2 twenty five"; 70 kg')).toMatchObject({
      value: 70,
      unit: 'kg',
      matches: [{ value: 70, unit: 'kg' }],
    });
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
  ])('keeps the compound height with semicolons in %s', raw => {
    expect(parseMeasurement(raw)).toEqual({
      value: 75,
      unit: 'in',
      type: 'height',
      raw,
      matches: [
        { value: 6, unit: 'ft' },
        { value: 3, unit: 'in' },
      ],
    });
  });

  it.each([
    ['6 1-2 ft 3;cm', 3, 'cm'],
    ['6 1-2 ft 12;in', 12, 'in'],
  ] as const)('keeps the separate measurement outside a compound in %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit, matches: [{ value, unit }] });
  });

  // Confirmed failing-input probes. Explicit expected values follow option 1 and 6 × 12 + 3.
  it.each([
    ['6 1-2 ft; 3 in', {}, 75, 'in', 'height'],
    ['6 1-2 ft 3; in', {}, 75, 'in', 'height'],
    ['6 1-2; ft 3 in', {}, 75, 'in', 'height'],
    ['150-180; lbs 70 kg', {}, 70, 'kg', 'weight'],
    ['1-2; ft 6 in', {}, 6, 'in', 'height'],
    ['1-2; ft; 6 in', {}, 6, 'in', 'height'],
    ['50-70; kg, 180 lbs', {}, 180, 'lb', 'weight'],
    ['150-180;;; lbs 70 kg', {}, 70, 'kg', 'weight'],
    ['1-2; ft 6 in', { normalizedUnit: 'cm' }, 15.24, 'cm', 'height'],
    ['150-180; poundz 70 kg', { fuzziness: 1 }, 70, 'kg', 'weight'],
    ['150-180; pounds seventy kilograms', {}, 70, 'kg', 'weight'],
    ['150–180; lbs 70 kg', {}, 70, 'kg', 'weight'],
  ] as const)('handles semicolons next to the range in %s', (raw, options, value, unit, type) => {
    expect(parseMeasurement(raw, options)).toMatchObject({ value, unit, type });
  });

  it('does not attach a semicolon-separated range unit to a bare number', () => {
    expect(parseMeasurement('1-2; ft 6')).toBeNull();
  });

  it('does not join number words across a range for unqualified inference', () => {
    expect(
      parseMeasurement('twenty 1-2 five', {
        type: 'height',
        allowUnqualified: true,
      })
    ).toBeNull();
    expect(
      parseMeasurement('twenty 1-2 five', {
        type: 'weight',
        allowUnqualified: true,
      })
    ).toBeNull();
  });

  // Re-review: a supported prefix already owns the number before the range.
  it.each([
    ['kg 70 1-2 ft 6 in', {}, 6, 'in'],
    ['kilograms seventy 1-2 ft 6 in', {}, 6, 'in'],
    ['lbs 150 1-2 ft 6 in', {}, 6, 'in'],
    ['inches 6 1-2 ft 6 in', {}, 6, 'in'],
    ['kg; 70 1-2 ft 6 in', {}, 6, 'in'],
    ['kg: 70 1-2 ft 6 in', {}, 6, 'in'],
    ['(kg) 70 1-2 ft 6 in', {}, 6, 'in'],
    ['age=28, kg=70 1-2 ft 6 in', {}, 6, 'in'],
    ['record 0; kg 70 1-2 ft 6 in', {}, 6, 'in'],
    ['0 kg 6 1-2 ft 3 in', {}, 3, 'in'],
    ['kg 70 1-2; ft 6; in', {}, 6, 'in'],
    ['poundz 70 1-2 ft 6 in', { fuzziness: 1 }, 6, 'in'],
  ] as const)('does not reuse the prefix value in %s', (raw, options, value, unit) => {
    expect(parseMeasurement(raw, options)).toEqual({
      value,
      unit,
      type: 'height',
      raw,
      matches: [{ value, unit }],
    });
  });

  // A bare inch part after feet also owns its number: 5 ft + 5 in = 65 in.
  it('does not reuse a bare inch value as feet across the range', () => {
    expect(parseMeasurement('5 ft 5 1-2 ft 0 in')).toMatchObject({
      value: 65,
      unit: 'in',
      matches: [
        { value: 5, unit: 'ft' },
        { value: 5, unit: 'in' },
      ],
    });
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
  ])('keeps the free feet value in %s', raw => {
    expect(parseMeasurement(raw, { type: 'height' })).toMatchObject({
      value: 75,
      unit: 'in',
      matches: [
        { value: 6, unit: 'ft' },
        { value: 3, unit: 'in' },
      ],
    });
  });

  it('preserves the zero-foot and semicolon ownership rules', () => {
    expect(parseMeasurement('ft six 1-2 ft 3 in')).toMatchObject({
      value: 75,
      unit: 'in',
      matches: [
        { value: 6, unit: 'ft' },
        { value: 3, unit: 'in' },
      ],
    });
    expect(parseMeasurement('record 0; ft 12 1-2 ft 3 in')).toMatchObject({
      value: 147,
      unit: 'in',
      matches: [
        { value: 12, unit: 'ft' },
        { value: 3, unit: 'in' },
      ],
    });
    expect(parseMeasurement('0 ft 70 1-2 ft 3 in')).toMatchObject({
      value: 843,
      unit: 'in',
      matches: [
        { value: 70, unit: 'ft' },
        { value: 3, unit: 'in' },
      ],
    });
    expect(parseMeasurement('0 ft 12 1-2 ft 3 in')).toMatchObject({
      value: 147,
      unit: 'in',
      matches: [
        { value: 12, unit: 'ft' },
        { value: 3, unit: 'in' },
      ],
    });
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
  ])('does not take an independent inch label in %s', raw => {
    expect(parseMeasurement(raw)).toEqual({
      value: 72,
      unit: 'in',
      type: 'height',
      raw,
      matches: [{ value: 72, unit: 'in' }],
    });
  });

  it('does not claim an independent inch field with no value', () => {
    expect(parseMeasurement('6 1-2 ft 3, in: height')).toBeNull();
  });

  it('keeps the short field-name rule when its value has its own unit', () => {
    expect(parseMeasurement('6 1-2 ft 3 in=72 cm')).toMatchObject({
      value: 72,
      unit: 'cm',
      matches: [{ value: 72, unit: 'cm' }],
    });
  });

  it.each(['6 1-2 ft 3 (in)', '6 1-2 ft 3 in.', '6 1-2 ft 3 in: height'])(
    'keeps a label that owns the inch value before it in %s',
    raw => {
      expect(parseMeasurement(raw)).toMatchObject({
        value: 75,
        unit: 'in',
        matches: [
          { value: 6, unit: 'ft' },
          { value: 3, unit: 'in' },
        ],
      });
    }
  );

  it('removes fuzzy range units when fuzziness is enabled', () => {
    expect(parseMeasurement('150-180 poundz 70 kg', { fuzziness: 1 })).toMatchObject({
      value: 70,
      unit: 'kg',
      matches: [{ value: 70, unit: 'kg' }],
    });
    expect(parseMeasurement('poundz 150-180 70 kg', { fuzziness: 1 })).toMatchObject({
      value: 70,
      unit: 'kg',
      matches: [{ value: 70, unit: 'kg' }],
    });
  });

  it('normalizes only the surviving measurement', () => {
    expect(parseMeasurement('150-180 lbs 70 kg', { normalizedUnit: 'lb' })).toMatchObject({
      value: 70 / 0.45359237,
      unit: 'lb',
      matches: [{ value: 70, unit: 'kg' }],
    });
    expect(parseMeasurement('6 1-2 ft 3 in', { normalizedUnit: 'cm' })).toMatchObject({
      value: 190.5,
      unit: 'cm',
      matches: [
        { value: 6, unit: 'ft' },
        { value: 3, unit: 'in' },
      ],
    });
  });
});
