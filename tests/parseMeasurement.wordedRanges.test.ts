import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

describe('shared-unit ranges with word connectors', () => {
  it.each([
    '150 to 180 lbs',
    'from 150 to 180 lbs',
    'between 150 and 180 lbs',
    'BETWEEN 150 AND 180 LBS',
    'from\t150\nto 180lbs',
    'lbs 150 to 180',
    'lbs from 150 to 180',
    'lbs between 150 and 180',
    '150 to 150 lbs',
    '180 to 150 lbs',
    '72,5 to 80,5 kg',
    'between 1,250 and 1,500 lbs',
    '.5 to .75 kg',
    'between ½ and ¾ kg',
    '1/2 to 3/4 kg',
    '.5 to 3/4 kg',
    '1 to 1/2 kg',
    'from 1/2 to 3/4 kg',
    'from .5 to 3/4 kg',
    'from 1 to 1/2 kg',
    'between 1/2 and 3/4 kg',
    'between .5 and 3/4 kg',
    'between 1 and 1/2 kg',
    'between 150 and 180; pounds',
  ])('does not return an endpoint for %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
    expect(parseMeasurement(raw, { type: 'weight' })).toBeNull();
    expect(parseMeasurement(raw, { type: 'weight', allowUnqualified: true })).toBeNull();
  });

  it('rejects the ticket range with normalization', () => {
    expect(
      parseMeasurement('between 70 and 80 kg', { type: 'weight', normalizedUnit: 'kg' })
    ).toBeNull();
  });

  it.each(['1 to 2', 'from 1 to 2', 'between 1 and 2'])('retains boundaries around %s', range => {
    expect(parseMeasurement(`6 ${range} ft`)).toBeNull();
    expect(parseMeasurement(`ft ${range} 6`)).toBeNull();
    expect(parseMeasurement(`${range} ft 6`)).toBeNull();
    expect(parseMeasurement(`6 ${range} ft 3 in`)).toMatchObject({
      value: 75,
      unit: 'in',
      matches: [
        { value: 6, unit: 'ft' },
        { value: 3, unit: 'in' },
      ],
    });
    expect(parseMeasurement(`6 ft ${range} 11 in`)).toMatchObject({ value: 83, unit: 'in' });
    expect(parseMeasurement(`6 ft ${range} in`)).toMatchObject({
      value: 6,
      unit: 'ft',
      matches: [{ value: 6, unit: 'ft' }],
    });
  });

  it.each([
    ['50 to 70 kg, 180 lbs', 180, 'lb'],
    ['from 50 to 70 kg, 180 lbs', 180, 'lb'],
    ['between 50 and 70 kg, 180 lbs', 180, 'lb'],
    ['70 kg, between 150 and 180 lbs', 70, 'kg'],
    ['between 150 and 180 lbs 70 kg', 70, 'kg'],
    ['age=20 to 30, kg=70', 70, 'kg'],
    ['age=between 20 and 30; kg=70', 70, 'kg'],
    ['1/2 to 3/4 kg; recorded 180 lbs', 180, 'lb'],
    ['from 1/2 to 3/4 kg; recorded 180 lbs', 180, 'lb'],
    ['between 1/2 and 3/4 kg; recorded 180 lbs', 180, 'lb'],
  ] as const)('keeps the independent measurement in %s', (raw, value, unit) => {
    expect(parseMeasurement(raw, { type: 'weight' })).toEqual({
      value,
      unit,
      type: 'weight',
      raw,
      matches: [{ value, unit }],
    });
  });

  it('normalizes only the independent measurement', () => {
    expect(parseMeasurement('between 50 and 70 kg, 180 lbs', { normalizedUnit: 'kg' })).toEqual({
      value: 180 * 0.45359237,
      unit: 'kg',
      type: 'weight',
      raw: 'between 50 and 70 kg, 180 lbs',
      matches: [{ value: 180, unit: 'lb' }],
    });
  });

  it('keeps inches after an omitted slash-fraction range', () => {
    expect(parseMeasurement('6 ft 1/2 to 3/4 11 in', { type: 'height' })).toMatchObject({
      value: 83,
      unit: 'in',
      matches: [
        { value: 6, unit: 'ft' },
        { value: 11, unit: 'in' },
      ],
    });
  });

  it('omits a range with a fuzzy unit', () => {
    expect(parseMeasurement('150 to 180 poundz, 70 kg', { fuzziness: 1 })).toMatchObject({
      value: 70,
      unit: 'kg',
      matches: [{ value: 70, unit: 'kg' }],
    });
  });

  it.each([
    ['150 lbs', 150, 'lb'],
    ['70 kg (154 lbs)', 70, 'kg'],
    ['5 ft and 11 in', 71, 'in'],
    ['one hundred and fifty pounds', 150, 'lb'],
    ['one hundred and 50 pounds', 150, 'lb'],
    ['150 and 180 lbs', 180, 'lb'],
    ['150 lbs to 150 lbs', 150, 'lb'],
    ['from 70 kg to 154 lbs', 70, 'kg'],
    ['between 70 kg and 154 lbs', 70, 'kg'],
    ['walk to 180 cm', 180, 'cm'],
    ['between meals, 180 lbs', 180, 'lb'],
    ['150 today 180 lbs', 180, 'lb'],
  ] as const)('preserves numbers and independent measurements in %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit });
  });

  it.each(['150-180 lbs', '150 lbs - 180 lbs', '210 lbs to 180 lbs'])(
    'preserves existing rejection of %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );
});
