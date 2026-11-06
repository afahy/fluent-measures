import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

const big = `1${'0'.repeat(307)}`;
const bigger = `1${'0'.repeat(308)}`;
const smaller = `2${'0'.repeat(306)}`;

// AFA-236: expectations use 1 ft = 0.3048 m and 1 in = 0.0254 m, independently
// of the parser's centimeter intermediates. Relative error works at these magnitudes.
describe('finite conversions with overflowing intermediates', () => {
  it.each([
    ['ft', 'm', big, 1e307, 3.048e306],
    ['m', 'ft', big, 1e307, 3.280839895013123e307],
    ['in', 'm', bigger, 1e308, 2.54e306],
    ['m', 'in', smaller, 2e306, 7.874015748031496e307],
  ] as const)('converts large %s to %s', (from, to, digits, sourceValue, expected) => {
    const raw = `${digits} ${from}`;
    const result = parseMeasurement(raw, { normalizedUnit: to });
    expect(result).toMatchObject({
      unit: to,
      type: 'height',
      raw,
      matches: [{ value: sourceValue, unit: from }],
    });
    expect(Math.abs(result!.value / expected - 1)).toBeLessThan(1e-14);
  });

  it.each([undefined, 'imperial'] as const)('converts inferred inches with %s units', inferUnit => {
    const result = parseMeasurement(bigger, {
      type: 'height',
      allowUnqualified: true,
      inferUnit,
      normalizedUnit: 'm',
    });
    expect(result).toMatchObject({
      unit: 'm',
      type: 'height',
      raw: bigger,
      matches: [{ value: 1e308, unit: 'in' }],
    });
    expect(Math.abs(result!.value / 2.54e306 - 1)).toBeLessThan(1e-14);
  });

  it.each([
    [`${big} m`, 'in'], // 1e307 / 0.0254 exceeds Number.MAX_VALUE.
    [`${bigger} m`, 'ft'], // 1e308 / 0.3048 exceeds Number.MAX_VALUE.
    [`${big} ft`, 'cm'], // 1e307 * 30.48 exceeds Number.MAX_VALUE.
    [`${bigger} in`, 'cm'], // 1e308 * 2.54 exceeds Number.MAX_VALUE.
  ] as const)('rejects an infinite target for %s to %s', (raw, normalizedUnit) => {
    expect(parseMeasurement(raw, { normalizedUnit })).toBeNull();
  });

  // Preserve the established order of arithmetic for finite ordinary conversions.
  // Each expectation is calculated from the exact unit definitions, not a parser result.
  it.each([
    ['3 ft', 'm', (3 * 12 * 2.54) / 100],
    ['3 in', 'm', (3 * 2.54) / 100],
    ['1 m', 'ft', 100 / (12 * 2.54)],
    ['72 m', 'in', (72 * 100) / 2.54],
  ] as const)('preserves ordinary rounding for %s to %s', (raw, normalizedUnit, expected) => {
    expect(parseMeasurement(raw, { normalizedUnit })?.value).toBe(expected);
  });
});
