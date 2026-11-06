import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

// Exact failure inputs and expected results from AFA-74 and its mixed-slash comment.
describe('fraction boundaries', () => {
  it.each(['5/2-180 lbs', '5.5 ½ ft', '5½2 lb'])(
    'rejects the malformed fraction or range in %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  it.each(['5 ft (10/180 lbs)', '5 ft, 10/180 lbs'])(
    'keeps the weight after the height separator in %s',
    raw => {
      expect(parseMeasurement(raw, { type: 'weight' })).toMatchObject({
        value: 180,
        unit: 'lb',
        type: 'weight',
        matches: [{ value: 180, unit: 'lb' }],
      });
    }
  );

  it('keeps a pair of different slashes as separators', () => {
    expect(parseMeasurement('1⁄2/180 lbs')).toMatchObject({
      value: 180,
      unit: 'lb',
      type: 'weight',
      matches: [{ value: 180, unit: 'lb' }],
    });
  });

  // AFA-74's same boundaries with other decimal, slash, range and mark spellings.
  it.each([
    '180-5/2 lbs',
    '5/2 – 180 lbs',
    '180 – 5/2 lbs',
    '5⁄2-180 lbs',
    '5.5½ ft',
    '.5 ½ ft',
    ',5 ½ ft',
    'feet 5.5 ½',
    '5.5 ¼ ft',
    '5½20 lb',
    '5½2.5 lb',
    '½2 lb',
    '５½２ lb',
  ])('rejects the same invalid boundary in %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it.each(['1/2/180 lbs', '1/2⁄180 lbs', '1⁄2⁄180 lbs'])(
    'preserves the final weight after two slashes in %s',
    raw => {
      expect(parseMeasurement(raw)).toMatchObject({ value: 180, unit: 'lb' });
    }
  );

  it.each([
    '5 feet (10/180 lbs)',
    '5 foot [10/180 lbs]',
    '5ft (10/180lbs)',
    '5 FT, 10/180 LBS',
    "5' (10/180 lbs)",
    '60" (10/180 lbs)',
    '5 (ft) 10/180 lbs',
    '5 [ft] 10/180 lbs',
    '5 ft, (10⁄180 lbs)',
  ])('retains the separated weight with feet or marks in %s', raw => {
    expect(parseMeasurement(raw, { type: 'weight' })).toMatchObject({ value: 180, unit: 'lb' });
  });

  // Punctuation after prose is not a feet/inch owner. Fractions still mean 1 / 2 pound.
  it.each(['weight (1/2 lbs)', 'left (1/2 lbs)', 'heft (1/2 lbs)', 'weight, 1/2 lbs'])(
    'keeps a proper fraction after prose in %s',
    raw => {
      expect(parseMeasurement(raw)).toMatchObject({ value: 0.5, unit: 'lb' });
    }
  );

  // AFA-74 and PARSING.md: an omitted range does not take an independent measurement's unit.
  it.each(['5/2-180 lbs; 70 kg', '180-5/2 lbs; 70 kg'])(
    'keeps the later measurement after %s',
    raw => {
      expect(parseMeasurement(raw)).toMatchObject({ value: 70, unit: 'kg' });
    }
  );

  it('normalizes only the weight selected across the slash', () => {
    expect(parseMeasurement('5 ft (10/180 lbs)', { normalizedUnit: 'kg' })).toMatchObject({
      value: 81.6466266, // 180 × 0.45359237
      unit: 'kg',
      matches: [{ value: 180, unit: 'lb' }],
    });
  });

  it('keeps the height selected across the slash', () => {
    expect(parseMeasurement('5 ft (10/180 lbs)', { type: 'height' })).toMatchObject({
      value: 70, // 5 × 12 + 10
      unit: 'in',
      matches: [
        { value: 5, unit: 'ft' },
        { value: 10, unit: 'in' },
      ],
    });
  });

  it('rejects malformed Unicode fractions during unqualified inference', () => {
    expect(parseMeasurement('5½2', { type: 'weight', allowUnqualified: true })).toBeNull();
    expect(parseMeasurement('5.5 ½', { type: 'height', allowUnqualified: true })).toBeNull();
    expect(parseMeasurement('5½', { type: 'weight', allowUnqualified: true })).toMatchObject({
      value: 5.5,
      unit: 'lb',
    });
  });

  it('preserves valid fractional shorthand and rejects an invalid endpoint', () => {
    expect(parseMeasurement('5-1/2', { type: 'height' })).toMatchObject({
      value: 60.5, // 5 × 12 + 1 / 2
      unit: 'in',
    });
    expect(parseMeasurement('5-5/2', { type: 'height' })).toBeNull();
  });
});
