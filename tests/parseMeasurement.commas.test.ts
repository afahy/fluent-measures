import { describe, it, expect } from 'vitest';
import { parseMeasurement } from '../src';

describe('measurement numbers containing commas', () => {
  it.each([
    ['72,5 kg', 72.5, 'kg', 'weight'],
    ['1,000 lbs', 1000, 'lb', 'weight'],
    ['72,05kg', 72.05, 'kg', 'weight'],
    ['0,5 kg', 0.5, 'kg', 'weight'],
    ['1,000,000 lbs', 1000000, 'lb', 'weight'],
    ['1,234.56 lbs', 1234.56, 'lb', 'weight'],
    ['12,345,678.9 lbs', 12345678.9, 'lb', 'weight'],
    ['kg 72,5', 72.5, 'kg', 'weight'],
    ['1,75 m', 1.75, 'm', 'height'],
    ['1,800cm', 1800, 'cm', 'height'],
  ])('parses the complete number in %s', (raw, value, unit, type) => {
    expect(parseMeasurement(raw)).toEqual({
      value,
      unit,
      type,
      raw,
      matches: [{ value, unit }],
    });
  });

  it.each(['-72,5 kg', '-1,000 lbs', 'kg-72,5', '-0,5 kg'])(
    'keeps negative measurements invalid in %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  it.each([
    ['72,5', 72.5],
    ['1,000', 1000],
  ])('normalizes an unqualified number in %s', (raw, value) => {
    expect(
      parseMeasurement(raw, { type: 'weight', allowUnqualified: true, inferUnit: 'metric' })
    ).toEqual({ value, unit: 'kg', type: 'weight', raw, matches: [{ value, unit: 'kg' }] });
  });

  it('converts the complete comma-separated value', () => {
    expect(parseMeasurement('1,000 lbs', { normalizedUnit: 'kg' })).toEqual({
      value: 453.59237,
      unit: 'kg',
      type: 'weight',
      raw: '1,000 lbs',
      matches: [{ value: 1000, unit: 'lb' }],
    });
  });
});
