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
});
