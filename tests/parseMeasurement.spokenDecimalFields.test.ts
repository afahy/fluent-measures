// AFA-250 approved policy revision of main c670d12. Original inputs, assertions and
// AFA-202/247/248 rationale are archived in main-migration-preparation/main-original.
// Historical comments below describe the earlier contract; the migrated null cases
// reject the whole entry under the rule named by their test and exact ledger row.
import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

// AFA-247: preserve semicolon fields and the feet-prefix integer stop. Values follow
// independent labeled fields and compound arithmetic: 5 * 12 + 11.5 = 71.5 inches.
describe('spoken decimal field identity and feet prefixes', () => {
  it.each([
    ['kg -seventy point five; 80 kg', {}],
    ['kg -seventy point five;80 kg', {}],
    ['kg −seventy point five; 80 kg', {}],
    ['kg -seventy point 5; eighty kg', {}],
    ['kg -point five; 80 kg', {}],
    ['kg -seventy point five; 80;kg', {}],
    ['kg -seventy point five; kg=80', {}],
    ['kg -70.5; 80 kg', {}],
    ['-seventy point five kg; 80 kg', {}],
    ['kg -seventy point five; ft: 5 11', { type: 'height' }],
  ] as const)('rejects %s under AFA-250: signed', (input, options) => {
    expect(parseMeasurement(input, options)).toBeNull();
  });

  it.each([
    ['ft 5 eleven point five', {}, 71.5, 'in'],
    ['feet five eleven point five', {}, 71.5, 'in'],
    ['ft: 5 eleven point five', {}, 71.5, 'in'],
    ['ft 5 eleven point five inches', {}, 71.5, 'in'],
    ['ft 5 11.5', {}, 71.5, 'in'],
    ['5 ft eleven point five', {}, 71.5, 'in'],
    ['ft five point five', {}, 5.5, 'ft'],
    ['ft point five', {}, 0.5, 'ft'],
    ['kg seventy five point five', {}, 75.5, 'kg'],
    ['ft five and a half', {}, 5.5, 'ft'],
    ['ft 5 11; pounds: two hundred point five', { type: 'weight' }, 200.5, 'lb'],
    ['ft: five eleven point five; kg: seventy point five', { type: 'height' }, 71.5, 'in'],
    ['ft: five eleven point five; kg: seventy point five', { type: 'weight' }, 70.5, 'kg'],
  ] as const)('keeps %s with %o at %s %s', (input, options, value, unit) => {
    expect(parseMeasurement(input, options)).toMatchObject({ value, unit });
  });

  it.each([
    ['ft 5 11 two hundred point five pounds', { type: 'height' }],
    ['feet five eleven two hundred point five pounds', { type: 'height' }],
    ['ft 5 11 two hundred point five pounds', {}],
  ] as const)('rejects %s under AFA-250: pair-separator', (input, options) => {
    expect(parseMeasurement(input, options)).toBeNull();
  });

  it.each([
    ['kg -seventy point five 80 kg', {}],
    ['kg -seventy point five; -80 kg', {}],
    ['ft one point twenty', {}],
    ['kg 70 five point five', {}],
    ['ft -five eleven point five', {}],
    ['ft -a five eleven point five', {}],
    ['-one two point five kg', {}],
  ] as const)('rejects %s with %o', (input, options) => {
    expect(parseMeasurement(input, options)).toBeNull();
  });
});
