import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions } from '../src';

// AFA-66: with metric inference, a lone number below 3 can only be a height in meters, because no
// one is 3 cm tall. From 3 up, it stays centimeters.
const metricHeight = { type: 'height', allowUnqualified: true, inferUnit: 'metric' } as const;

describe('a metric height with no unit', () => {
  it.each([
    // The inputs from AFA-66.
    ['1.75', 1.75, 'm'],
    ['1.8', 1.8, 'm'],
    // "175" stays 175 cm (corpus), and so does 3, the first value that isn't below 3.
    ['175', 175, 'cm'],
    ['3', 3, 'cm'],
  ] as const)('reads %s as %s %s', (raw, value, unit) => {
    expect(parseMeasurement(raw, metricHeight)).toMatchObject({ value, unit, type: 'height' });
  });

  // normalizedUnit still decides the result's unit: 1.75 m is 1.75 × 100 = 175 cm.
  it('gives 1.75 in centimeters with normalizedUnit', () => {
    expect(parseMeasurement('1.75', { ...metricHeight, normalizedUnit: 'cm' })).toMatchObject({
      value: 175,
      unit: 'cm',
    });
  });

  // "Must not change" in AFA-66: imperial heights (README) and metric weights.
  it.each([
    ['72', { type: 'height', allowUnqualified: true, inferUnit: 'imperial' }, 72, 'in'],
    ['70', { type: 'weight', allowUnqualified: true, inferUnit: 'metric' }, 70, 'kg'],
    ['1.75', { type: 'weight', allowUnqualified: true, inferUnit: 'metric' }, 1.75, 'kg'],
  ] as const)('keeps reading %s with %o as %s %s', (raw, options: ParseOptions, value, unit) => {
    expect(parseMeasurement(raw, options)).toMatchObject({ value, unit });
  });
});
