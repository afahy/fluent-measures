import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

// AFA-247 review: commas separate fields, bracketed equivalents agree, and feet retain
// their bare-inch component before a separate weight. Expected sums use 5 * 12 + 11 = 71.
describe('spoken decimal review boundaries', () => {
  it.each([
    ['age twenty point 5, 80 kg', {}, 80, 'kg'],
    ['age twenty point 05, seventy kg', {}, 70, 'kg'],
    ['age twenty point 5, kg 80', {}, 80, 'kg'],
    ['age twenty point 5, point five kg', {}, 0.5, 'kg'],
    ['kg seventy point 5, 70.5 kg', {}, 70.5, 'kg'],
    ['meters one point 8, 180 cm', {}, 1.8, 'm'],
    ['kg zero point five (.5 kg)', {}, 0.5, 'kg'],
    ['kg zero point five [point five kg]', {}, 0.5, 'kg'],
    ['kg zero point five (point five kg)', {}, 0.5, 'kg'],
    ['kg zero point five (,5 kg)', {}, 0.5, 'kg'],
    ['kg zero point five (1/2 kg)', {}, 0.5, 'kg'],
    ['meters zero point five (.5 m)', {}, 0.5, 'm'],
    ['5 ft 11 two hundred point five pounds', {}, 71, 'in'],
    ['5 ft 11 two hundred point five pounds', { type: 'height' }, 71, 'in'],
    ['5 ft eleven two hundred point five pounds', { type: 'height' }, 71, 'in'],
    ['5 ft 11 and two hundred point five pounds', { type: 'height' }, 71, 'in'],
    ['5 ft ten and one two hundred point five pounds', { type: 'height' }, 71, 'in'],
    ['5 ft 11 200.5 pounds', { type: 'height' }, 71, 'in'],
    ['5 ft eleven point five', { type: 'height' }, 71.5, 'in'],
    ['72,5 kg', {}, 72.5, 'kg'],
  ] as const)('keeps the independent values in %s', (raw, options, value, unit) => {
    expect(parseMeasurement(raw, options)).toMatchObject({ value, unit });
  });

  it('does not infer inches from an invalid decimal prefix', () => {
    // The invalid phrase cannot supply one inch. Whole-entry rejection belongs to AFA-250.
    const result = parseMeasurement('5 ft one point twenty in');
    expect(result?.matches ?? []).not.toContainEqual({ value: 1, unit: 'in' });
  });

  it.each([
    'age twenty point 5, -80 kg',
    'kg zero point five (.6 kg)',
    'kg zero point five (point six kg)',
    'one and two point five kg',
    'one point twenty in',
  ])('rejects signed, disagreeing or malformed values in %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });
});
