import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

describe('unqualified measurement normalization', () => {
  it.each([
    [
      '72',
      { type: 'height', inferUnit: 'imperial', normalizedUnit: 'cm' } as const,
      { value: 182.88, unit: 'cm', sourceUnit: 'in' },
    ],
    [
      '180',
      { type: 'height', inferUnit: 'metric', normalizedUnit: 'm' } as const,
      { value: 1.8, unit: 'm', sourceUnit: 'cm' },
    ],
    [
      '220',
      { type: 'weight', inferUnit: 'imperial', normalizedUnit: 'kg' } as const,
      { value: 99.79032140000001, unit: 'kg', sourceUnit: 'lb' },
    ],
  ])('normalizes inferred input %s', (raw, options, expected) => {
    expect(parseMeasurement(raw, { ...options, allowUnqualified: true })).toEqual({
      matches: [{ value: Number(raw), unit: expected.sourceUnit }],
      value: expected.value,
      unit: expected.unit,
      type: options.type,
      raw,
    });
  });

  it('rejects normalization to a unit of another measurement type', () => {
    expect(() =>
      parseMeasurement('72', {
        type: 'height',
        allowUnqualified: true,
        normalizedUnit: 'kg',
      })
    ).toThrow('Cannot convert in to kg');
  });
});
