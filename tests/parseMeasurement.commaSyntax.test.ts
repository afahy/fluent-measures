import { describe, it, expect } from 'vitest';
import { parseMeasurement } from '../src';

describe('comma numbers in range and height syntax', () => {
  it.each([
    '72,5-80,5 kg',
    '1,75-1,85 m',
    '72,5 – 80,5kg',
    'kg 72,5-80,5',
    '1,250-1,500 lbs',
    'lbs 1,250–1,500',
    '1,000,250-1,000,500 lbs',
    '72,5-80.5 kg',
    '72.5-80,5 kg',
  ])('rejects the complete shared-unit range in %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
    expect(parseMeasurement(raw, { type: 'weight', allowUnqualified: true })).toBeNull();
  });

  it.each([
    ['5-11,5', 71.5, 5, 11.5],
    ['5-0,5', 60.5, 5, 0.5],
    [' 5-11,50 ', 71.5, 5, 11.5],
    ['0-0,5', 0.5, 0, 0.5],
    ['5-11,05', 71.05, 5, 11.05],
  ])('parses comma inches in bare height shorthand %s', (raw, value, feet, inches) => {
    expect(parseMeasurement(raw, { type: 'height' })).toEqual({
      value,
      unit: 'in',
      type: 'height',
      raw,
      matches: [
        { value: feet, unit: 'ft' },
        { value: inches, unit: 'in' },
      ],
    });
  });

  it('normalizes comma shorthand to the requested height unit', () => {
    const raw = '5-11,5';
    const result = parseMeasurement(raw, { type: 'height', normalizedUnit: 'cm' });
    expect(result).toMatchObject({ unit: 'cm', type: 'height', raw });
    expect(result?.value).toBeCloseTo(181.61);
  });

  it('still requires an explicit height type for bare shorthand', () => {
    expect(parseMeasurement('5-11,5')).toBeNull();
    expect(parseMeasurement('5-11,5', { type: 'weight' })).toBeNull();
  });

  it.each(['5-12,0', '5--0,5', '-5-11,5'])('keeps invalid comma shorthand rejected in %s', raw => {
    expect(parseMeasurement(raw, { type: 'height' })).toBeNull();
  });
});
