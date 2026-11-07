// AFA-250 approved policy revision of main c670d12. Original inputs, assertions and
// AFA-202/247/248 rationale are archived in main-migration-preparation/main-original.
// Historical comments below describe the earlier contract; the migrated null cases
// reject the whole entry under the rule named by their test and exact ledger row.
import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

// AFA-247 independent probes: bracketed conversions remain separate, trailing conjunctions
// separate fields, and unsupported decimal words/signs cannot leak a partial value.
// 1 m = 100 cm; 155.4 lb = 70.488254298 kg (within 1% of 70.5 kg).
describe('spoken decimal boundaries', () => {
  it.each([
    [
      'kg seventy point five and height 180 cm',
      { type: 'weight' },
      { value: 70.5, unit: 'kg', type: 'weight' },
    ],
    [
      'm: one point eight and kg: seventy point five',
      { type: 'height' },
      { value: 1.8, unit: 'm', type: 'height' },
    ],
    [
      'kg: seventy point five and cm: 180',
      { type: 'weight' },
      { value: 70.5, unit: 'kg', type: 'weight' },
    ],
  ] as const)('keeps the whole meaning of %s', (raw, options, expected) => {
    expect(parseMeasurement(raw, options)).toMatchObject(expected);
  });

  it.each([
    ['kg seventy point five and pounds one hundred fifty five point four', {}],
    ['kg one hundred point zero (101 kg)', {}],
    ['kg one hundred point zero (100 kg)', {}],
    ['kg: one hundred point zero (101 kg)', {}],
    ['kg seventy point five (70.5 kg)', {}],
    ['meters one point eight (180 centimeters)', {}],
    ['pounds one hundred point zero (100 lbs)', {}],
    ['inches seventy point zero (70")', {}],
  ] as const)('rejects %s under AFA-250: duplicate', (raw, options) => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });

  it.each([
    ['6 ft 1-2 eleven point five in', {}],
    ['kg seventy point five 1-2', {}],
  ] as const)('rejects %s under AFA-250: range', (raw, options) => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });
  it.each([
    ['seventy point oh five kilograms', {}],
    ['one point o five meters', {}],
    ['kg one hundred point zero (102 kg)', {}],
    ['point oh five kilograms', {}],
    ['seventy point five oh six kilograms', {}],
    ['kilograms seventy point five oh six', {}],
    ['seventy point - five kilograms', {}],
    ['kg one hundred point zero (100 kg); kg one hundred point zero (102 kg)', {}],
  ] as const)('rejects the complete invalid measurement %s', (raw, options) => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });
});
