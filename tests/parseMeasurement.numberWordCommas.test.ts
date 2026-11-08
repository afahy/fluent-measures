// AFA-250: recovery expectations now follow the approved complete-entry contract in PARSING.md.
// Earlier ticket rationales below describe their historical extraction contract; original
// assertions are retained separately under design/afa-250.
import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

describe('a comma after a number word before digits', () => {
  // AFA-179: PARSING.md's comma-and-space rule separates a label's number from the measurement.
  it.each([
    'phase twenty, 5 cm',
    'I am forty, 5 kg overweight',
    'phase twenty, 10 cm',
    'phase twenty , 5 cm',
    'PHASE TWENTY,\t5 cm',
    'phase one hundred, 5 kg',
    'phase one thousand, 5 kg',
    'phase twenty, .5 kg',
    'phase twenty, ½ kg',
    'phase twenty, 5,5 kg',
    'phase one thousand, 1,000 kg',
    'phase twenty, 5kg',
    'phase twenty, 5 kilograms',
  ])('rejects the complete entry %s (AFA-250)', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it('rejects duplicate weights after separate numeric labels', () => {
    // AFA-250 replaces agreement with rejection; retain both option paths from AFA-179.
    const raw = 'phase twenty, 5 kg; phase forty, 5 kg';
    expect(parseMeasurement(raw)).toBeNull();
    expect(parseMeasurement(raw, { type: 'weight' })).toBeNull();
  });

  it('rejects unrelated comma fields with fuzzy units and normalization', () => {
    const raw = 'phase twenty, 5 kilogams';
    expect(parseMeasurement(raw, { fuzziness: 1 })).toBeNull();
    expect(parseMeasurement('phase twenty, 5 cm', { normalizedUnit: 'm' })).toBeNull();
  });

  it.each(['kg twenty, 5', 'kg: twenty, 5'])('rejects the complete entry %s (AFA-250)', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it('rejects an incomplete phrase after feet', () => {
    expect(parseMeasurement('5 ft ten, 5')).toBeNull();
    expect(parseMeasurement('1 m seventy, 5 cm')).toBeNull();
  });

  it('does not infer a unit for two comma-separated numbers', () => {
    expect(parseMeasurement('twenty, 5', { type: 'weight', defaultUnit: 'lb' })).toBeNull();
    expect(
      parseMeasurement('twenty, 5', {
        type: 'height',
        defaultUnit: 'cm',
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

  it.each(['twenty, 5 kg 25 kg', 'kg twenty, 5 kg'])('rejects distinct measurements in %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it('does not extend an earlier sign across the comma', () => {
    expect(parseMeasurement('-twenty, 5 kg')).toBeNull();
  });

  it.each([
    'twenty 10 kg',
    'twenty,5 kg',
    'twenty; 5 kg',
    'one hundred, kg',
    'phase-2, 180 cm',
    'phase2,180 cm',
  ])('rejects the complete entry %s (AFA-250)', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });
  it.each([
    ['twenty five kg', 25, 'kg'],
    ['twenty 5 kg', 25, 'kg'],
    ['one hundred and 50 pounds', 150, 'lb'],
  ] as const)('keeps the existing interpretation of %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit, matches: [{ value, unit }] });
  });
});

// AFA-250: retain every original explicit selector/inference path when recovery becomes null.
it.each([
  ['phase twenty, 5 cm', { type: 'height' }],
  ['phase twenty, 5 cm', { type: 'weight' }],
  ['I am forty, 5 kg overweight', { type: 'height' }],
  ['I am forty, 5 kg overweight', { type: 'weight' }],
  ['phase twenty, 10 cm', { type: 'height' }],
  ['phase twenty, 10 cm', { type: 'weight' }],
  ['phase twenty , 5 cm', { type: 'height' }],
  ['phase twenty , 5 cm', { type: 'weight' }],
  ['PHASE TWENTY,\t5 cm', { type: 'height' }],
  ['PHASE TWENTY,\t5 cm', { type: 'weight' }],
  ['phase one hundred, 5 kg', { type: 'height' }],
  ['phase one hundred, 5 kg', { type: 'weight' }],
  ['phase one thousand, 5 kg', { type: 'height' }],
  ['phase one thousand, 5 kg', { type: 'weight' }],
  ['phase twenty, .5 kg', { type: 'height' }],
  ['phase twenty, .5 kg', { type: 'weight' }],
  ['phase twenty, ½ kg', { type: 'height' }],
  ['phase twenty, ½ kg', { type: 'weight' }],
  ['phase twenty, 5,5 kg', { type: 'height' }],
  ['phase twenty, 5,5 kg', { type: 'weight' }],
  ['phase one thousand, 1,000 kg', { type: 'height' }],
  ['phase one thousand, 1,000 kg', { type: 'weight' }],
  ['phase twenty, 5kg', { type: 'height' }],
  ['phase twenty, 5kg', { type: 'weight' }],
  ['phase twenty, 5 kilograms', { type: 'height' }],
  ['phase twenty, 5 kilograms', { type: 'weight' }],
] as const)('rejects incomplete entry %s with original options %j', (raw, options) => {
  expect(parseMeasurement(raw, options)).toBeNull();
});
