// AFA-250: recovery expectations now follow the approved complete-entry contract in PARSING.md.
// Earlier ticket rationales below describe their historical extraction contract; original
// assertions are retained separately under design/afa-250.
import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions } from '../src';

const weightOptions: ParseOptions[] = [{}, { type: 'weight' }];

describe.each(weightOptions)('weight number ownership across comma boundaries with %o', options => {
  // Independent review of AFA-179: a signed supported part owns its number even after an
  // unsupported unit word. Only its field is discarded; the later field still supplies 70 kg.
  it('rejects a signed part before another field', () => {
    const raw = 'stone -5 lb; actual 70 kg';
    expect(parseMeasurement(raw, options)).toBeNull();
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

  // AFA-203 extends signed supported-prefix ownership beyond comma-and-space boundaries.
  // These were preservation cases for AFA-179's narrower scope; the ticket now requires null.
  it.each([
    'kg -twenty five 5 grams; actual 70 kg',
    'kg -20 5 grams; actual 70 kg',
    'kg -twenty five,5 grams; actual 70 kg',
    'kg -twenty five; 5 grams; actual 70 kg',
  ])('rejects the incomplete weight without a comma boundary in %s', raw => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });
});
