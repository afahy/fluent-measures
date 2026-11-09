// AFA-250: recovery expectations now follow the approved complete-entry contract in PARSING.md.
// Earlier ticket rationales below describe their historical extraction contract; original
// assertions are retained separately under design/afa-250.
import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

describe('commas between number words', () => {
  // AFA-75's three failure inputs and expected values, not the old joined phrases.
  it.each(['my son is two, thirty pounds', 'twenty, one hundred pounds', 'age one, twenty pounds'])(
    'rejects the complete entry %s (AFA-250)',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  it('rejects the complete prose entry on three consecutive retries', () => {
    const results = Array.from({ length: 3 }, () =>
      parseMeasurement('my son is two, thirty pounds')
    );
    expect(results).toEqual([null, null, null]);
  });

  // The ticket's independent quote-review finding: opening quotes don't erase a comma.
  it.each([
    'phase twenty, “5” cm',
    'phase twenty, ‘5’ cm',
    'phase twenty, “ .5” cm',
    'my son is two, “thirty” pounds',
    'my son is two,‘thirty’ pounds',
    'twenty, “one hundred” pounds',
  ])('rejects the complete entry %s (AFA-250)', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  // The ticket's boundary rule also applies without spaces, around multipliers, and in heights.
  it.each([
    'two,thirty pounds',
    'two , thirty pounds',
    'TWO,\tTHIRTY pounds',
    'twenty,one hundred pounds',
    'one hundred,twenty pounds',
    'one thousand,twenty pounds',
    'twenty,hundred pounds',
    'twenty,thousand pounds',
    'twenty,one,thirty pounds',
    'age two, thirty centimetres',
    '-two, thirty pounds',
    'kg twenty,one',
    'kg: twenty,one',
    'twenty, one-pound bag',
  ])('rejects the complete entry %s (AFA-250)', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it('rejects comma fragments with fuzzy units and normalization', () => {
    expect(parseMeasurement('two, thirty poundz', { fuzziness: 1 })).toBeNull();
    // 30 lb × 0.45359237 kg/lb = 13.6077711 kg.
    const converted = parseMeasurement('two, thirty pounds', { normalizedUnit: 'kg' });
    expect(converted).toBeNull();
    expect(converted).toBeNull();
  });

  it('rejects bare-inch fragments split by a comma', () => {
    expect(parseMeasurement('5 ft one,twenty')).toBeNull();
    expect(parseMeasurement('twenty, one\' ten"')).toBeNull();
  });

  it.each(['height', 'weight'] as const)('does not infer one %s from two phrases', type => {
    expect(
      parseMeasurement('two, thirty', { type, defaultUnit: type === 'height' ? 'in' : 'lb' })
    ).toBeNull();
    expect(
      parseMeasurement('two, thirty', { type, defaultUnit: type === 'height' ? 'cm' : 'kg' })
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

  it('rejects separate measurements regardless of agreement', () => {
    // AFA-250 supersedes the historical first-result policy, preserving both literal inputs.
    expect(parseMeasurement('two, thirty pounds; thirty pounds')).toBeNull();
    expect(parseMeasurement('two, thirty pounds; forty pounds')).toBeNull();
  });

  // Preservation cases come from the ticket, public examples and ordinary number arithmetic.
  it.each(['1,000, kg', 'age=28, in=72', 'twenty,5 kg', 'twenty; five kg'])(
    'rejects the complete entry %s (AFA-250)',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );
  it.each([
    ['one hundred fifty pounds', 150, 'lb'],
    ['one-eighty pounds', 180, 'lb'],
    ['five foot ten', 70, 'in'],
    ['1,234,56 kg', 1234.56, 'kg'],
    ['weight 72,5 kg', 72.5, 'kg'],
  ] as const)('preserves %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit });
  });
});

// AFA-250: retain every original explicit selector/inference path when recovery becomes null.
it.each([
  ['my son is two, thirty pounds', { type: 'weight' }],
  ['twenty, one hundred pounds', { type: 'weight' }],
  ['age one, twenty pounds', { type: 'weight' }],
  ['stone twenty,four lb', { type: 'weight' }],
  ['kg twenty,five grams', { type: 'weight' }],
  ['kg -twenty,five grams; actual 70 kg', { type: 'weight' }],
  ['twenty kg twenty,five oz', { type: 'weight' }],
  ['180 lbs, 8 oz of water a day', { type: 'weight' }],
  ['kg 3, 400 g', { type: 'weight' }],
] as const)('rejects incomplete entry %s with original options %j', (raw, options) => {
  expect(parseMeasurement(raw, options)).toBeNull();
});
