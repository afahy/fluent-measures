// AFA-250 approved policy revision of main c670d12. Original inputs, assertions and
// AFA-202/247/248 rationale are archived in main-migration-preparation/main-original.
// Historical comments below describe the earlier contract; the migrated null cases
// reject the whole entry under the rule named by their test and exact ledger row.
import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

// AFA-247 review: commas separate fields, bracketed equivalents agree, and feet retain
// their bare-inch component before a separate weight. Expected sums use 5 * 12 + 11 = 71.
describe('spoken decimal review boundaries', () => {
  it.each([
    ['age twenty point 5, 80 kg', {}],
    ['age twenty point 05, seventy kg', {}],
    ['age twenty point 5, kg 80', {}],
    ['age twenty point 5, point five kg', {}],
  ] as const)('rejects %s under AFA-250: prose', (raw, options) => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });

  it.each([
    ['kg seventy point 5, 70.5 kg', {}],
    ['meters one point 8, 180 cm', {}],
    ['kg zero point five (.5 kg)', {}],
    ['kg zero point five [point five kg]', {}],
    ['kg zero point five (point five kg)', {}],
    ['kg zero point five (,5 kg)', {}],
    ['kg zero point five (1/2 kg)', {}],
    ['meters zero point five (.5 m)', {}],
  ] as const)('rejects %s under AFA-250: duplicate', (raw, options) => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });

  it.each([
    ['5 ft 11 two hundred point five pounds', {}],
    ['5 ft 11 two hundred point five pounds', { type: 'height' }],
    ['5 ft eleven two hundred point five pounds', { type: 'height' }],
    ['5 ft 11 200.5 pounds', { type: 'height' }],
  ] as const)('rejects %s under AFA-250: pair-separator', (raw, options) => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });

  it.each([
    ['5 ft 11 and two hundred point five pounds', { type: 'height' }, 71, 'in'],
    ['5 ft eleven point five', { type: 'height' }, 71.5, 'in'],
    ['72,5 kg', {}, 72.5, 'kg'],
  ] as const)('keeps the independent values in %s', (raw, options, value, unit) => {
    expect(parseMeasurement(raw, options)).toMatchObject({ value, unit });
  });

  it.each([['5 ft ten and one two hundred point five pounds', { type: 'height' }]] as const)(
    'rejects %s under AFA-250: number-phrase',
    (raw, options) => {
      expect(parseMeasurement(raw, options)).toBeNull();
    }
  );

  it('rejects number-phrase under AFA-250', () => {
    // AFA-250: the complete malformed decimal invalidates the entire height.
    expect(parseMeasurement('5 ft one point twenty in')).toBeNull();
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
