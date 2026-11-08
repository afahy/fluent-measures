import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

describe('unqualified measurement normalization', () => {
  it.each([
    [
      '72',
      { type: 'height', normalizedUnit: 'cm', defaultUnit: 'in' } as const,
      { value: 182.88, unit: 'cm', sourceUnit: 'in' },
    ],
    [
      '180',
      { type: 'height', normalizedUnit: 'm', defaultUnit: 'cm' } as const,
      { value: 1.8, unit: 'm', sourceUnit: 'cm' },
    ],
    [
      '100',
      { type: 'weight', normalizedUnit: 'lb', defaultUnit: 'kg' } as const,
      { value: 100 / 0.45359237, unit: 'lb', sourceUnit: 'kg' },
    ],
    [
      '220',
      { type: 'weight', normalizedUnit: 'kg', defaultUnit: 'lb' } as const,
      { value: 99.79032140000001, unit: 'kg', sourceUnit: 'lb' },
    ],
  ])('normalizes default-unit input %s', (raw, options, expected) => {
    expect(parseMeasurement(raw, options)).toEqual({
      matches: [{ value: Number(raw), unit: expected.sourceUnit }],
      value: expected.value,
      unit: expected.unit,
      type: options.type,
      raw,
    });
  });

  // Inches to feet divides by 12, so the smallest number underflows to zero.
  it('rejects a default-unit result when conversion underflows to zero', () => {
    const raw = `0.${'0'.repeat(323)}5`;
    expect(
      parseMeasurement(raw, {
        type: 'height',
        normalizedUnit: 'ft',
        defaultUnit: 'in',
      })
    ).toBeNull();
  });

  it('rejects normalization to a unit of another measurement type', () => {
    expect(() =>
      parseMeasurement('72', {
        type: 'height',
        normalizedUnit: 'kg',
        defaultUnit: 'in',
      })
    ).toThrow('normalizedUnit kg is not a height unit');
  });
});
