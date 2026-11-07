import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

// AFA-247: preserve semicolon fields and the feet-prefix integer stop. Values follow
// independent labeled fields and compound arithmetic: 5 * 12 + 11.5 = 71.5 inches.
describe('spoken decimal field identity and feet prefixes', () => {
  it.each([
    ['kg -seventy point five; 80 kg', {}, 80, 'kg'],
    ['kg -seventy point five;80 kg', {}, 80, 'kg'],
    ['kg −seventy point five; 80 kg', {}, 80, 'kg'],
    ['kg -seventy point 5; eighty kg', {}, 80, 'kg'],
    ['kg -point five; 80 kg', {}, 80, 'kg'],
    ['kg -seventy point five; 80;kg', {}, 80, 'kg'],
    ['kg -seventy point five; kg=80', {}, 80, 'kg'],
    ['kg -70.5; 80 kg', {}, 80, 'kg'],
    ['-seventy point five kg; 80 kg', {}, 80, 'kg'],
    ['ft 5 eleven point five', {}, 71.5, 'in'],
    ['feet five eleven point five', {}, 71.5, 'in'],
    ['ft: 5 eleven point five', {}, 71.5, 'in'],
    ['ft 5 eleven point five inches', {}, 71.5, 'in'],
    ['ft 5 11.5', {}, 71.5, 'in'],
    ['5 ft eleven point five', {}, 71.5, 'in'],
    ['ft 5 11 two hundred point five pounds', { type: 'height' }, 71, 'in'],
    ['feet five eleven two hundred point five pounds', { type: 'height' }, 71, 'in'],
    ['ft five point five', {}, 5.5, 'ft'],
    ['ft point five', {}, 0.5, 'ft'],
    ['kg seventy five point five', {}, 75.5, 'kg'],
    ['ft five and a half', {}, 5.5, 'ft'],
    ['kg -seventy point five; ft: 5 11', { type: 'height' }, 71, 'in'],
    ['ft 5 11; pounds: two hundred point five', { type: 'weight' }, 200.5, 'lb'],
    ['ft 5 11 two hundred point five pounds', {}, 71, 'in'],
    ['ft: five eleven point five; kg: seventy point five', { type: 'height' }, 71.5, 'in'],
    ['ft: five eleven point five; kg: seventy point five', { type: 'weight' }, 70.5, 'kg'],
  ] as const)('keeps %s with %o at %s %s', (input, options, value, unit) => {
    expect(parseMeasurement(input, options)).toMatchObject({ value, unit });
  });

  it.each([
    ['kg -seventy point five 80 kg', {}],
    ['kg -seventy point five; -80 kg', {}],
    ['ft one point twenty', {}],
    ['kg 70 five point five', {}],
    ['ft -five eleven point five', {}],
    ['ft -a five eleven point five', {}],
  ] as const)('rejects %s with %o', (input, options) => {
    expect(parseMeasurement(input, options)).toBeNull();
  });
});
