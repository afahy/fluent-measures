// AFA-250 approved policy revision of main c670d12. Original inputs, assertions and
// AFA-202/247/248 rationale are archived in main-migration-preparation/main-original.
// Historical comments below describe the earlier contract; the migrated null cases
// reject the whole entry under the rule named by their test and exact ledger row.
import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

// AFA-247: decimal digits are place values, not a second measurement. Expected conversions
// use 1 lb = 0.45359237 kg, 1 m = 100 cm and 1 ft = 12 in.
describe('spoken decimal measurements', () => {
  it.each([
    [
      'seventy point five kilograms',
      { type: 'weight', normalizedUnit: 'kg' },
      70.5,
      'kg',
      70.5,
      'kg',
    ],
    [
      'seventy point five pounds',
      { type: 'weight', normalizedUnit: 'kg' },
      31.978262085,
      'kg',
      70.5,
      'lb',
    ],
    ['one point eight meters', { type: 'height', normalizedUnit: 'cm' }, 180, 'cm', 1.8, 'm'],
    ['kilograms seventy point five', {}, 70.5, 'kg', 70.5, 'kg'],
    ['pounds seventy point five', { normalizedUnit: 'kg' }, 31.978262085, 'kg', 70.5, 'lb'],
    ['meters one point eight', { normalizedUnit: 'cm' }, 180, 'cm', 1.8, 'm'],
    ['m: one point eight', {}, 1.8, 'm', 1.8, 'm'],
    ['Height (in): seventy point five', {}, 70.5, 'in', 70.5, 'in'],
    ['in. seventy point five', {}, 70.5, 'in', 70.5, 'in'],
    ['one point zero five meters', {}, 1.05, 'm', 1.05, 'm'],
    ['zero point zero five kilograms', {}, 0.05, 'kg', 0.05, 'kg'],
    ['point five meters', {}, 0.5, 'm', 0.5, 'm'],
    ['kg point five', {}, 0.5, 'kg', 0.5, 'kg'],
    ['one hundred and fifty point two five pounds', {}, 150.25, 'lb', 150.25, 'lb'],
    ['seventy point 5 kg', {}, 70.5, 'kg', 70.5, 'kg'],
    ['70 point zero five kg', {}, 70.05, 'kg', 70.05, 'kg'],
    ['kg 70 point 25', {}, 70.25, 'kg', 70.25, 'kg'],
    ['SEVENTY POINT FIVE KILOGRAMS', {}, 70.5, 'kg', 70.5, 'kg'],
    ['one point eight metrs', { fuzzy: true }, 1.8, 'm', 1.8, 'm'],
    ['one point eight', { type: 'height', defaultUnit: 'm' }, 1.8, 'm', 1.8, 'm'],
    ['seventy point five', { type: 'weight', defaultUnit: 'lb' }, 70.5, 'lb', 70.5, 'lb'],
  ] as const)('reads all of %s', (raw, options, value, unit, part, partUnit) => {
    const result = parseMeasurement(raw, options);
    expect(result?.value).toBeCloseTo(value, 10);
    expect(result).toMatchObject({ unit, raw, matches: [{ value: part, unit: partUnit }] });
  });

  it.each([
    ['kg point five 2_notes', {}],
    ['I weigh seventy point five kilograms today', {}],
  ] as const)('rejects %s under AFA-250: prose', (raw, options) => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });

  it.each([['seventy point five;kg', {}]] as const)(
    'rejects %s under AFA-250: semicolon',
    (raw, options) => {
      expect(parseMeasurement(raw, options)).toBeNull();
    }
  );

  it.each([
    'seventy point',
    'seventy point twenty five',
    'one point ten',
    'seventy point five point two',
    'seventy point five hundred',
    'seventy point and five',
    'seventy point five and a half',
    'one and two point five',
    '1.5 point two',
    'one point 2.5',
    'point',
  ])('rejects the complete malformed phrase %s', phrase => {
    expect(parseMeasurement(`${phrase} kg`)).toBeNull();
    expect(parseMeasurement(`kg ${phrase}`)).toBeNull();
    expect(parseMeasurement(phrase, { type: 'weight', defaultUnit: 'lb' })).toBeNull();
  });

  it.each([
    '-seventy point five kg',
    'kg -seventy point five',
    '−one point eight meters',
    '-point five kg',
    'kg -point five',
    '−point five kg',
    'phase twenty, −point five kg',
    'phase 20; ﹣point five kg',
    '-a hundred point five kg',
    'seventy point zero kg, -seventy point five kg',
  ])('keeps signed decimals invalid: %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it.each([
    ['70.5 kg', {}, 70.5, 'kg'],
    ['seventy five kilograms', {}, 75, 'kg'],
    ['one hundred fifty pounds', {}, 150, 'lb'],
    ['1.8 m', { normalizedUnit: 'cm' }, 180, 'cm'],
    ['five foot eleven', { type: 'height' }, 71, 'in'],
    ['5 and a half feet', {}, 5.5, 'ft'],
    ['5 1/2 ft', {}, 5.5, 'ft'],
    ['5½ ft', {}, 5.5, 'ft'],
    ['1,000 lbs', {}, 1000, 'lb'],
    ['72,5 kg', {}, 72.5, 'kg'],
    ['1,234,56 kg', {}, 1234.56, 'kg'],
    ['5 ft eleven point five', {}, 71.5, 'in'],
    ['1 m eighty point five cm', {}, 180.5, 'cm'],
    ['m: one cm: point five', {}, 100.5, 'cm'],
    ['ft: five inches: point five', {}, 60.5, 'in'],
  ] as const)('preserves the boundaries in %s', (raw, options, value, unit) => {
    expect(parseMeasurement(raw, options)).toMatchObject({ value, unit });
  });

  it.each([
    ['my son is two, thirty pounds', {}],
    ['phase twenty, 5 cm', {}],
    ['phase twenty, point five cm', {}],
    ['age twenty, seventy point five kg', {}],
    ['age=28, kg=seventy point five', {}],
    ['age=28, kg=seventy point five lbs', {}],
    ['age one point five, kg: seventy', {}],
    ['age one point five; kg: seventy', {}],
  ] as const)('rejects %s under AFA-250: prose', (raw, options) => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });

  it.each([
    ['point, five kg', {}],
    ['point, 5 kg', {}],
    ['m: one cm: and eighty', {}],
  ] as const)('rejects %s under AFA-250: number-phrase', (raw, options) => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });

  it.each([['0 kg, 80 lb', {}]] as const)('rejects %s under AFA-250: zero', (raw, options) => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });

  it('rejects prose under AFA-250; keeps the valid selected pair', () => {
    expect(parseMeasurement('age=one point twenty; kg=seventy')).toBeNull();
    expect(
      parseMeasurement('m: one point eight; kg: seventy point five', { type: 'weight' })
    ).toMatchObject({ value: 70.5, unit: 'kg' });
  });
});
