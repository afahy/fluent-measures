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
      'kg seventy point five and pounds one hundred fifty five point four',
      {},
      { value: 70.5, unit: 'kg', type: 'weight' },
    ],
    ['kg one hundred point zero (101 kg)', {}, { value: 100, unit: 'kg', type: 'weight' }],
    ['kg one hundred point zero (100 kg)', {}, { value: 100, unit: 'kg', type: 'weight' }],
    ['kg: one hundred point zero (101 kg)', {}, { value: 100, unit: 'kg', type: 'weight' }],
    ['kg seventy point five (70.5 kg)', {}, { value: 70.5, unit: 'kg', type: 'weight' }],
    ['meters one point eight (180 centimeters)', {}, { value: 1.8, unit: 'm', type: 'height' }],
    ['pounds one hundred point zero (100 lbs)', {}, { value: 100, unit: 'lb', type: 'weight' }],
    ['inches seventy point zero (70")', {}, { value: 70, unit: 'in', type: 'height' }],
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
    ['seventy point oh five kilograms', {}],
    ['one point o five meters', {}],
    ['kg one hundred point zero (102 kg)', {}],
    ['point oh five kilograms', {}],
    ['seventy point five oh six kilograms', {}],
    ['kilograms seventy point five oh six', {}],
    ['seventy point - five kilograms', {}],
  ] as const)('rejects the complete invalid measurement %s', (raw, options) => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });
});
