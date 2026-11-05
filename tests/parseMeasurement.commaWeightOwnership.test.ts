import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions } from '../src';

const weightOptions: ParseOptions[] = [{}, { type: 'weight' }];

describe.each(weightOptions)('weight number ownership across comma boundaries with %o', options => {
  // Independent review of AFA-179: a signed supported part owns its number even after an
  // unsupported unit word. Only its field is discarded; the later field still supplies 70 kg.
  it('keeps an independent field after a signed part', () => {
    const raw = 'stone -5 lb; actual 70 kg';
    expect(parseMeasurement(raw, options)).toEqual({
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw,
      matches: [{ value: 70, unit: 'kg' }],
    });
  });

  // PARSING.md's "stone 12, 4 lb" rule also applies to words. The comma ends the first
  // number, so the unsupported prefix owns it; the second number belongs to the supported part.
  it.each([
    'stone twenty, 4 lb',
    'stone one hundred, 4 lb',
    'stone twenty, 4 pounds',
    'grams twenty, 4 kg',
    'stone twenty, 4lb',
    'stone twenty, 1/2 lb',
    'stone twenty, 1 lb',
    'stone twenty, 9 lb',
    'stone one hundred, 50 lb',
    'stone: twenty, 4 lb',
  ])('rejects both parts in %s', raw => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });

  // PARSING.md keeps unsupported parts connected across commas. A sign on a supported
  // unit's number does not detach its following grams or ounces from that weight.
  it.each([
    'kg -twenty, 5 grams; actual 70 kg',
    'kg -twenty five, 5 grams; actual 70 kg',
    'kg -a hundred, 5 grams; actual 70 kg',
    'kg: -twenty, 5 grams; actual 70 kg',
    'lb -one hundred, 5 oz; actual 70 kg',
    'kg -twenty, 5; grams; actual 70 kg',
  ])('keeps a signed unit-first weight connected in %s', raw => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });

  // This ticket changes comma-and-space boundaries only. Preserve main for other separators;
  // the separate signed-ownership ticket owns their incomplete-weight correction.
  it.each([
    'kg -twenty five 5 grams; actual 70 kg',
    'kg -20 5 grams; actual 70 kg',
    'kg -twenty five,5 grams; actual 70 kg',
    'kg -twenty five; 5 grams; actual 70 kg',
  ])('preserves the existing result without the new comma boundary in %s', raw => {
    expect(parseMeasurement(raw, options)).toEqual({
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw,
      matches: [{ value: 70, unit: 'kg' }],
    });
  });
});
