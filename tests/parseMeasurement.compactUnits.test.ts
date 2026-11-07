import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

describe('compact units and metric height shorthand', () => {
  // Ticket inputs; totals are feet × 12 + inches, or meters × 100 + centimeters.
  it.each([
    ['5ft11', 5, 11, 71],
    ['6ft2', 6, 2, 74],
    ['6.0ft2', 6, 2, 74],
    ['5ft11in', 5, 11, 71],
    ['6ft1in', 6, 1, 73],
    ['5ft11"', 5, 11, 71],
    ['6foot2', 6, 2, 74],
    ['5ft.11in.', 5, 11, 71],
    ['6 1-2ft3in', 6, 3, 75],
  ] as const)('reads both parts of %s', (raw, feet, inches, value) => {
    expect(parseMeasurement(raw)).toEqual({
      value,
      unit: 'in',
      type: 'height',
      raw,
      matches: [
        { value: feet, unit: 'ft' },
        { value: inches, unit: 'in' },
      ],
    });
    expect(parseMeasurement(raw, { type: 'height', normalizedUnit: 'cm' })?.value).toBeCloseTo(
      value * 2.54
    );
    expect(parseMeasurement(raw, { type: 'weight' })).toBeNull();
  });

  it.each([
    ['1m75', 75, 175],
    ['1m80', 80, 180],
    ['1.0m80', 80, 180],
    ['1 m 80', 80, 180],
    ['1 meter 80', 80, 180],
    ['one meter eighty', 80, 180],
  ] as const)('reads bare centimeters in %s', (raw, centimeters, value) => {
    const expected = {
      value,
      unit: 'cm',
      type: 'height',
      raw,
      matches: [
        { value: 1, unit: 'm' },
        { value: centimeters, unit: 'cm' },
      ],
    };
    expect(parseMeasurement(raw)).toEqual(expected);
    expect(parseMeasurement(raw, { normalizedUnit: 'cm' })).toEqual(expected);
    expect(parseMeasurement(raw, { type: 'height', normalizedUnit: 'm' })?.value).toBeCloseTo(
      value / 100
    );
    expect(parseMeasurement(raw, { type: 'weight' })).toBeNull();
  });

  it.each([
    ['70kgs', 70, 'kg', 'weight'],
    ['175cms', 175, 'cm', 'height'],
  ] as const)('accepts the short plural in %s', (raw, value, unit, type) => {
    expect(parseMeasurement(raw)).toEqual({ value, unit, type, raw, matches: [{ value, unit }] });
    expect(parseMeasurement(raw, { type, normalizedUnit: unit })?.value).toBe(value);
  });

  it.each([
    ['150lbs', 150, 'lb'],
    ['1.83m', 1.83, 'm'],
    ['73.2kg', 73.2, 'kg'],
    ['5\'11"', 71, 'in'],
    ['5G phone, 180 lbs', 180, 'lb'],
    ['1 m', 1, 'm'],
    ['1 m 80 cm', 180, 'cm'],
    ['5 ft 11 in', 71, 'in'],
    ['6ft1-2in', 6, 'ft'],
    ['6 1-2 ft 3 in', 75, 'in'],
  ] as const)('preserves %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit });
  });

  it.each(['M 28', 'kg-70.5', 'A4 paper', 'B12 dose 5 mg', '5.11'])('does not infer %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
    expect(parseMeasurement(raw, { type: 'height' })).toBeNull();
  });

  it.each([
    '1m1',
    '1m99',
    '1m99.5',
    '1meter80',
    '1meters80',
    '1metre80',
    '1metres80',
    '1 m80',
    '1m.80',
    'one metre eighty',
    '1 m 80 cm',
    '1m80cms',
  ])('reads metric variants: %s', raw => {
    const part = raw === '1m1' ? 1 : raw === '1m99' ? 99 : raw === '1m99.5' ? 99.5 : 80;
    expect(parseMeasurement(raw)).toMatchObject({
      value: 100 + part,
      unit: 'cm',
      matches: [
        { value: 1, unit: 'm' },
        { value: part, unit: 'cm' },
      ],
    });
  });

  it.each([
    '1 m 0',
    '1 m 100',
    '1 m 101',
    '1 m -80',
    '1 m; 80',
    '1 m 80 kg',
    '1 m 80 oz',
    '1 m eighty grams',
  ])('keeps the bare-part limits and unit ownership: %s', raw => {
    expect(parseMeasurement(raw, { type: 'height' })).toMatchObject({
      value: 1,
      unit: 'm',
      matches: [{ value: 1, unit: 'm' }],
    });
  });

  it.each(['1m80kg', '1m80kgs'])('leaves compact weight ownership: %s', raw => {
    expect(parseMeasurement(raw, { type: 'height' })).toMatchObject({ value: 1, unit: 'm' });
    expect(parseMeasurement(raw, { type: 'weight' })).toMatchObject({ value: 80, unit: 'kg' });
  });

  it.each(['0m80', '0meter80', '0 meter 80', 'zero meters eighty'])(
    'keeps a zero larger part in the same shorthand: %s',
    raw => {
      // The same next-part rule: 0 × 100 + 80 = 80 centimeters.
      expect(parseMeasurement(raw)).toMatchObject({ value: 80, unit: 'cm' });
    }
  );

  it.each(['0 meter 100', 'zero meters one hundred'])(
    'does not turn an oversized bare smaller part into meters: %s',
    raw => {
      // As for bare inches below 12, bare centimeters must be below 100.
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  it.each([
    'abc5ft11',
    'a1m80',
    '_1m80',
    'é1m80',
    '١1m80',
    'xft11',
    'abc1.5ft11',
    '_1.5m80',
    '5..5ft11',
  ])('keeps identifiers: %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it.each(['-1m80', '-5ft11', '1.5m80', '5.5ft6in', '1m80in'])(
    'rejects signed or conflicting parts: %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  it.each(['5feet11', '5 ft11', '5FT11', 'five ft11', 'ft5 11'])('reads feet variants: %s', raw => {
    expect(parseMeasurement(raw)).toMatchObject({ value: 71, unit: 'in' });
  });

  it.each([0, 1, 1.5, 2, Infinity])('keeps short plurals exact at fuzziness %s', fuzziness => {
    expect(parseMeasurement('kgs seventy', { fuzziness })).toMatchObject({ value: 70, unit: 'kg' });
    expect(parseMeasurement('cms 175', { fuzziness })).toMatchObject({ value: 175, unit: 'cm' });
    expect(parseMeasurement('70 kgsx', { fuzziness })).toBeNull();
    expect(parseMeasurement('175 cmsx', { fuzziness })).toBeNull();
  });
});
