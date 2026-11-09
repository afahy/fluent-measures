// AFA-250: recovery expectations now follow the approved complete-entry contract in PARSING.md.
// Earlier ticket rationales below describe their historical extraction contract; original
// assertions are retained separately under design/afa-250.
import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions } from '../src';

const weightOptions: ParseOptions[] = [{}, { type: 'weight' }];

describe.each(weightOptions)('signed supported weight ownership with %o', options => {
  // AFA-203's four failure inputs. PARSING.md rejects an incomplete weight: the supported
  // prefix owns its signed amount, leaving the separately numbered grams part connected.
  it.each([
    'kg -twenty five 5 grams; actual 70 kg',
    'kg -20 5 grams; actual 70 kg',
    'kg -twenty five,5 grams; actual 70 kg',
    'kg -twenty five; 5 grams; actual 70 kg',
  ])('rejects the ticket failure %s', raw => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });

  // Independent review: a semicolon between a prefix and its signed amount is still inside
  // that part (PARSING.md, Semicolons). The signed reader ends just before the sign.
  it.each([
    'kg; -20 5 grams; actual 70 kg',
    'kg;; -twenty five 5 grams; actual 70 kg',
    'lb; -a hundred 5 ounces; actual 70 kg',
    'kg; -two and a half 5 grams; actual 70 kg',
  ])('keeps the supported owner across semicolons in %s', raw => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });

  // The same Unsupported Units rule covers supported aliases, labels, fractions, signs on
  // number words, either unit order, and separators between the two independently owned parts.
  it.each([
    'kilograms -20 5 grams; actual 70 kg',
    'pounds -20 5 ounces; actual 70 kg',
    'kg: -20 5 grams; actual 70 kg',
    'kg=-20 5 grams; actual 70 kg',
    '(kg) -20 5 grams; actual 70 kg',
    'kg -a hundred 5 grams; actual 70 kg',
    'kg --twenty five 5 grams; actual 70 kg',
    'kg -20.5 5 grams; actual 70 kg',
    'kg -1/2 5 grams; actual 70 kg',
    'kg -two and a half 5 grams; actual 70 kg',
    'kg -20 1/2 grams; actual 70 kg',
    'kg -20 grams 5; actual 70 kg',
    'kg -20; grams 5; actual 70 kg',
    'kg -twenty, 5 grams; actual 70 kg',
    'stone twenty, 4 lb',
    'stone 12, 4 lb',
  ])('rejects a connected unsupported part in %s', raw => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });

  // Ticket controls and the public number/label rules. A separately owned supported number
  // never becomes an unsupported prefix's amount; unrelated text still separates fields.
  it.each([
    'stone -5 lb; actual 70 kg',
    'I drink 8 oz of water, weight 180 lbs',
    'kg -20; ate 5 grams; actual 70 kg',
    'kg: -6 ft, 70 kg',
    'age=28, kg=72',
    '0 kg, 80 lb',
  ])('rejects the complete entry %s (AFA-250)', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });
  it('rejects an unknown introductory field with the original options', () => {
    expect(parseMeasurement('phase twenty, 5 kg', options)).toBeNull();
  });
  it.each([
    ['twenty five kg', 25, 'kg'],
    ['kg 70', 70, 'kg'],
    ['kg seventy', 70, 'kg'],
    ['kg=72', 72, 'kg'],
    ['1/2 kg', 0.5, 'kg'],
    ['5½ lb', 5.5, 'lb'],
    ['kg two and a half', 2.5, 'kg'],
    ['1,000 lbs', 1000, 'lb'],
    ['72,5 kg', 72.5, 'kg'],
    ['1,234,56 kg', 1234.56, 'kg'],
    ['185#', 185, 'lb'],
  ] as const)('preserves %s as %s %s', (raw, value, unit) => {
    expect(parseMeasurement(raw, options)).toEqual({
      value,
      unit,
      type: 'weight',
      raw,
      matches: [{ value, unit }],
    });
  });
});

it('rejects the incomplete weight when normalization selects weight', () => {
  expect(parseMeasurement('kg -20 5 grams; actual 70 kg', { normalizedUnit: 'lb' })).toBeNull();
});

it('rejects signed fragments with fuzzy supported aliases', () => {
  expect(parseMeasurement('kilogramm -20 5 grams; actual 70 kg', { fuzzy: true })).toBeNull();
});

it('rejects an unsupported other expression with a height selector', () => {
  const raw = 'kg -20 5 grams; actual 1.8 metres';
  expect(parseMeasurement(raw, { type: 'height' })).toBeNull();
});
