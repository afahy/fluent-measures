import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

describe('commas between number words', () => {
  // AFA-75's three failure inputs and expected values, not the old joined phrases.
  it.each([
    ['my son is two, thirty pounds', 30],
    ['twenty, one hundred pounds', 100],
    ['age one, twenty pounds', 20],
  ] as const)('reads only the number after the comma in %s', (raw, value) => {
    const expected = { value, unit: 'lb', type: 'weight', raw, matches: [{ value, unit: 'lb' }] };
    expect(parseMeasurement(raw)).toEqual(expected);
    expect(parseMeasurement(raw, { type: 'weight' })).toEqual(expected);
  });

  it('keeps the corrected boundary on three consecutive retries', () => {
    const values = Array.from(
      { length: 3 },
      () => parseMeasurement('my son is two, thirty pounds')?.value
    );
    expect(values).toEqual([30, 30, 30]);
  });

  // The ticket's boundary rule also applies without spaces, around multipliers, and in heights.
  it.each([
    ['two,thirty pounds', 30, 'lb', 'weight'],
    ['two , thirty pounds', 30, 'lb', 'weight'],
    ['TWO,\tTHIRTY pounds', 30, 'lb', 'weight'],
    ['twenty,one hundred pounds', 100, 'lb', 'weight'],
    ['one hundred,twenty pounds', 20, 'lb', 'weight'],
    ['one thousand,twenty pounds', 20, 'lb', 'weight'],
    ['twenty,hundred pounds', 100, 'lb', 'weight'],
    ['twenty,thousand pounds', 1000, 'lb', 'weight'],
    ['twenty,one,thirty pounds', 30, 'lb', 'weight'],
    ['age two, thirty centimetres', 30, 'cm', 'height'],
    ['-two, thirty pounds', 30, 'lb', 'weight'],
    ['kg twenty,one', 20, 'kg', 'weight'],
    ['kg: twenty,one', 20, 'kg', 'weight'],
    ['twenty, one-pound bag', 1, 'lb', 'weight'],
  ] as const)('separates the phrases in %s', (raw, value, unit, type) => {
    expect(parseMeasurement(raw)).toEqual({ value, unit, type, raw, matches: [{ value, unit }] });
  });

  it('keeps the boundary with fuzzy units and normalization', () => {
    expect(parseMeasurement('two, thirty poundz', { fuzziness: 1 })).toMatchObject({
      value: 30,
      unit: 'lb',
      matches: [{ value: 30, unit: 'lb' }],
    });
    // 30 lb × 0.45359237 kg/lb = 13.6077711 kg.
    const converted = parseMeasurement('two, thirty pounds', { normalizedUnit: 'kg' });
    expect(converted?.value).toBeCloseTo(13.6077711, 10);
    expect(converted).toMatchObject({ unit: 'kg', matches: [{ value: 30, unit: 'lb' }] });
  });

  it('ends a forward bare-inches phrase at the comma', () => {
    expect(parseMeasurement('5 ft one,twenty')).toMatchObject({
      value: 61,
      unit: 'in',
      matches: [
        { value: 5, unit: 'ft' },
        { value: 1, unit: 'in' },
      ],
    });
    expect(parseMeasurement('twenty, one\' ten"')).toMatchObject({
      value: 22,
      unit: 'in',
      matches: [
        { value: 1, unit: 'ft' },
        { value: 10, unit: 'in' },
      ],
    });
  });

  it.each(['height', 'weight'] as const)('does not infer one %s from two phrases', type => {
    expect(parseMeasurement('two, thirty', { type, allowUnqualified: true })).toBeNull();
    expect(
      parseMeasurement('two, thirty', { type, allowUnqualified: true, inferUnit: 'metric' })
    ).toBeNull();
  });

  it.each([
    'stone twenty,four lb',
    'kg twenty,five grams',
    'kg -twenty,five grams; actual 70 kg',
    'twenty kg twenty,five oz',
    '180 lbs, 8 oz of water a day',
    'kg 3, 400 g',
  ])('keeps unsupported weight parts connected in %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
    expect(parseMeasurement(raw, { type: 'weight' })).toBeNull();
  });

  it('still requires separate measurements to agree', () => {
    expect(parseMeasurement('two, thirty pounds; thirty pounds')).toMatchObject({
      value: 30,
      unit: 'lb',
    });
    expect(parseMeasurement('two, thirty pounds; forty pounds')).toBeNull();
  });

  // Preservation cases come from the ticket, public examples and ordinary number arithmetic.
  it.each([
    ['one hundred fifty pounds', 150, 'lb'],
    ['one-eighty pounds', 180, 'lb'],
    ['five foot ten', 70, 'in'],
    ['1,234,56 kg', 1234.56, 'kg'],
    ['1,000, kg', 1000, 'kg'],
    ['weight 72,5 kg', 72.5, 'kg'],
    ['age=28, in=72', 72, 'in'],
    ['twenty,5 kg', 25, 'kg'],
    ['twenty; five kg', 25, 'kg'],
  ] as const)('preserves %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit });
  });
});
