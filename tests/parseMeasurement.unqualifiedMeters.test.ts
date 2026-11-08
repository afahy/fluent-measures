import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions } from '../src';

// AFA-251 intentionally replaces AFA-66 magnitude guessing. Callers now name the source unit;
// these migrated AFA-66 examples retain their quantities through an explicit default.

describe('a metric height with no unit', () => {
  it.each([
    // The inputs from AFA-66.
    ['1.75', 1.75, 'm'],
    ['1.8', 1.8, 'm'],
    // Centimeters remain centimeters at every magnitude.
    ['175', 175, 'cm'],
    ['3', 3, 'cm'],
  ] as const)('reads %s as %s %s', (raw, value, unit) => {
    expect(parseMeasurement(raw, { defaultUnit: unit })).toMatchObject({
      value,
      unit,
      type: 'height',
    });
  });

  // normalizedUnit still decides the result's unit: 1.75 m is 1.75 × 100 = 175 cm.
  it('gives 1.75 in centimeters with normalizedUnit', () => {
    expect(parseMeasurement('1.75', { defaultUnit: 'm', normalizedUnit: 'cm' })).toMatchObject({
      value: 175,
      unit: 'cm',
    });
  });

  // "Must not change" in AFA-66: imperial heights (README) and metric weights.
  it.each([
    ['72', { defaultUnit: 'in' }, 72, 'in'],
    ['70', { defaultUnit: 'kg' }, 70, 'kg'],
    ['1.75', { defaultUnit: 'kg' }, 1.75, 'kg'],
  ] as const)('keeps reading %s with %o as %s %s', (raw, options: ParseOptions, value, unit) => {
    expect(parseMeasurement(raw, options)).toMatchObject({ value, unit });
  });
});
