import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions } from '../src';

// AFA-250 approval: two independent readings of one dimension reject, regardless of
// agreement. These expectations come from the approved policy, not the old parser's result.
describe('duplicate reading policy', () => {
  it.each([
    ['70 kg (154 lbs)', {}],
    ['70 kg (154 lbs)', { type: 'weight' }],
    ['70 kg (154 lbs)', { normalizedUnit: 'lb' }],
    ['70 kg; 70 kg', {}],
    ['kg: 70, lb: 154', {}],
    ['70 kilogams (154 pounds)', { fuzziness: 1 }],
    ['100 cm (101 cm)', { normalizedUnit: 'm' }],
    ['6 ft (72 in)', { type: 'height' }],
    ['0.5 m (50 cm)', {}],
    ['5 ft 0 in (152 cm)', {}],
    ['0 m; actual 1.8 m', {}],
    ['70 kg; 70 kg; 70 kg', {}],
  ] as const)('rejects %s with %o', (raw, options: ParseOptions) => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });

  // The fixed result corpus exposed these additional old successes. Independently, each
  // violates AFA-250: duplicate heights, an ineligible compound, or a standalone zero part.
  it.each([
    '¼kg-72," 72.5,"',
    '1,8feet – 0inches',
    '12,345 kilogram 1000 inches 1,000”',
    '180hundred foot,zero m',
    '0,m 150 72.5’',
    '180 cm (1.8 metre)',
    '6 ft = 1.83 metre',
  ])('rejects the retired recovery input %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it.each([
    ['70 kg', 70, 'kg', 'weight', [{ value: 70, unit: 'kg' }]],
    ['kg: 70', 70, 'kg', 'weight', [{ value: 70, unit: 'kg' }]],
    [
      '5 ft 11 in',
      71,
      'in',
      'height',
      [
        { value: 5, unit: 'ft' },
        { value: 11, unit: 'in' },
      ],
    ],
    [
      '1 m 80 cm',
      180,
      'cm',
      'height',
      [
        { value: 1, unit: 'm' },
        { value: 80, unit: 'cm' },
      ],
    ],
    [
      '0 ft 11 in',
      11,
      'in',
      'height',
      [
        { value: 0, unit: 'ft' },
        { value: 11, unit: 'in' },
      ],
    ],
    [
      '5 ft 0 in',
      60,
      'in',
      'height',
      [
        { value: 5, unit: 'ft' },
        { value: 0, unit: 'in' },
      ],
    ],
  ] as const)('preserves the complete measurement %s', (raw, value, unit, type, matches) => {
    // Identity; 5 × 12 + 11; 100 + 80; 0 × 12 + 11; 5 × 12 + 0.
    expect(parseMeasurement(raw)).toEqual({ value, unit, type, matches, raw });
  });

  it('converts one compound without comparing another reading', () => {
    // (5 × 12 + 11) × 2.54 = 180.34 cm.
    expect(parseMeasurement('5 ft 11 in', { normalizedUnit: 'cm' })).toEqual({
      value: 180.34,
      unit: 'cm',
      type: 'height',
      raw: '5 ft 11 in',
      matches: [
        { value: 5, unit: 'ft' },
        { value: 11, unit: 'in' },
      ],
    });
  });
});
