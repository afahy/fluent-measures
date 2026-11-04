import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

describe('a comma after a number word before digits', () => {
  // AFA-179: PARSING.md's comma-and-space rule separates a label's number from the measurement.
  it.each([
    ['phase twenty, 5 cm', 5, 'cm', 'height'],
    ['I am forty, 5 kg overweight', 5, 'kg', 'weight'],
    ['phase twenty, 10 cm', 10, 'cm', 'height'],
    ['phase twenty , 5 cm', 5, 'cm', 'height'],
    ['PHASE TWENTY,\t5 cm', 5, 'cm', 'height'],
    ['phase one hundred, 5 kg', 5, 'kg', 'weight'],
    ['phase one thousand, 5 kg', 5, 'kg', 'weight'],
    ['phase twenty, .5 kg', 0.5, 'kg', 'weight'],
    ['phase twenty, ½ kg', 0.5, 'kg', 'weight'],
    ['phase twenty, 5,5 kg', 5.5, 'kg', 'weight'],
    ['phase one thousand, 1,000 kg', 1000, 'kg', 'weight'],
    ['phase twenty, 5kg', 5, 'kg', 'weight'],
    ['phase twenty, 5 kilograms', 5, 'kg', 'weight'],
    ['phase twenty, 5 kg; phase forty, 5 kg', 5, 'kg', 'weight'],
  ] as const)('reads only the measurement in %s', (raw, value, unit, type) => {
    expect(parseMeasurement(raw)).toEqual({ value, unit, type, raw, matches: [{ value, unit }] });
    expect(parseMeasurement(raw, { type })).toEqual({
      value,
      unit,
      type,
      raw,
      matches: [{ value, unit }],
    });
  });

  it('uses the same boundary with fuzzy units and normalization', () => {
    const raw = 'phase twenty, 5 kilogams';
    expect(parseMeasurement(raw, { fuzziness: 1 })).toEqual({
      value: 5,
      unit: 'kg',
      type: 'weight',
      raw,
      matches: [{ value: 5, unit: 'kg' }],
    });
    expect(parseMeasurement('phase twenty, 5 cm', { normalizedUnit: 'm' })).toMatchObject({
      value: 0.05,
      unit: 'm',
      matches: [{ value: 5, unit: 'cm' }],
    });
  });

  it.each(['kg twenty, 5', 'kg: twenty, 5'])('ends the phrase read after a unit in %s', raw => {
    expect(parseMeasurement(raw)).toEqual({
      value: 20,
      unit: 'kg',
      type: 'weight',
      raw,
      matches: [{ value: 20, unit: 'kg' }],
    });
  });

  it('ends the bare inches phrase after feet', () => {
    expect(parseMeasurement('5 ft ten, 5')).toMatchObject({
      value: 70,
      unit: 'in',
      matches: [
        { value: 5, unit: 'ft' },
        { value: 10, unit: 'in' },
      ],
    });
    expect(parseMeasurement('1 m seventy, 5 cm')).toMatchObject({
      value: 105,
      unit: 'cm',
      matches: [
        { value: 1, unit: 'm' },
        { value: 5, unit: 'cm' },
      ],
    });
  });

  it('does not infer a unit for two comma-separated numbers', () => {
    expect(parseMeasurement('twenty, 5', { type: 'weight', allowUnqualified: true })).toBeNull();
    expect(
      parseMeasurement('twenty, 5', {
        type: 'height',
        allowUnqualified: true,
        inferUnit: 'metric',
      })
    ).toBeNull();
  });

  it.each([
    'stone twenty five, 4 lb',
    'stone -twenty five, 4 lb',
    'stone -a hundred, 4 lb',
    'kg twenty, 5 oz',
    '20 kg twenty, 5 oz',
    '20 kg twenty, 5 grams',
  ])('still rejects unsupported weight parts in %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it.each(['twenty, 5 kg 25 kg', 'kg twenty, 5 kg'])(
    'still requires distinct measurements to agree in %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  it('does not extend an earlier sign across the comma', () => {
    expect(parseMeasurement('-twenty, 5 kg')).toMatchObject({
      value: 5,
      unit: 'kg',
      matches: [{ value: 5, unit: 'kg' }],
    });
  });

  it.each([
    ['twenty five kg', 25, 'kg'],
    ['twenty 5 kg', 25, 'kg'],
    ['twenty 10 kg', 10, 'kg'],
    ['one hundred and 50 pounds', 150, 'lb'],
    ['twenty,5 kg', 25, 'kg'],
    ['twenty; 5 kg', 25, 'kg'],
    ['one hundred, kg', 100, 'kg'],
    ['phase-2, 180 cm', 180, 'cm'],
    ['phase2,180 cm', 180, 'cm'],
  ] as const)('keeps the existing interpretation of %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit, matches: [{ value, unit }] });
  });
});
