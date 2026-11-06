import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

// AFA-74 inputs; the maintainer retained proper fractions after punctuation on 2026-11-06.
describe('fraction boundaries', () => {
  it.each(['5/2-180 lbs', '5.5 ½ ft', '5½2 lb'])(
    'rejects the malformed fraction or range in %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  it.each(['5 ft (10/180 lbs)', '5 ft, 10/180 lbs'])(
    'preserves the approved proper-fraction weight in %s',
    raw => {
      expect(parseMeasurement(raw, { type: 'weight' })).toMatchObject({
        value: 0.05555555555555555, // 10 / 180
        unit: 'lb',
        type: 'weight',
        matches: [{ value: 0.05555555555555555, unit: 'lb' }],
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
  ])('preserves a proper fraction after punctuation in %s', raw => {
    expect(parseMeasurement(raw, { type: 'weight' })).toMatchObject({
      value: 0.05555555555555555, // 10 / 180
      unit: 'lb',
    });
  });

  it.each(['5 ft, 1/2 lbs', '5 ft (1/2 lbs)'])(
    'preserves a half-pound weight after punctuation in %s',
    raw => {
      expect(parseMeasurement(raw, { type: 'weight' })).toMatchObject({ value: 0.5, unit: 'lb' });
    }
  );

  // Punctuation after prose is not a feet/inch owner. Fractions still mean 1 / 2 pound.
  it.each(['weight (1/2 lbs)', 'left (1/2 lbs)', 'heft (1/2 lbs)', 'weight, 1/2 lbs'])(
    'keeps a proper fraction after prose in %s',
    raw => {
      expect(parseMeasurement(raw)).toMatchObject({ value: 0.5, unit: 'lb' });
    }
  );

  // PARSING.md Feet and Inches and 1 / 2: an explicit inch unit keeps a proper fraction.
  it.each([
    ["5' (1/2 in)", 60.5],
    ['6 ft, 1/2 in', 72.5],
    ['6 feet, 1/2 inch', 72.5],
    ['6 foot (1/2 inches)', 72.5],
    ['6 ft, 1/2"', 72.5],
    ['6 ft, 1⁄2″', 72.5],
    ['6 ft (1/2) in', 72.5],
    ["6 ft, 1/2''", 72.5],
  ] as const)('keeps the explicit fraction of an inch in %s', (raw, value) => {
    expect(parseMeasurement(raw, { type: 'height' })).toMatchObject({ value, unit: 'in' });
  });

  // Review findings: closing prose quotes are not height marks; a weight range owns no inches.
  it.each(['"weight" (1/2 lbs)', 'weight "today", 1/2 lbs'])(
    'keeps a fraction after quoted prose in %s',
    raw => {
      expect(parseMeasurement(raw)).toMatchObject({ value: 0.5, unit: 'lb' });
    }
  );

  it.each([
    "5'10/180-190 lbs",
    '5 ft 10/180-190 lbs',
    '5 feet 10/180–190 lbs',
    "five'10/180-190 lbs",
    '5 FOOT 10/180-190 lbs',
  ])('keeps the independent height before a weight range in %s', raw => {
    expect(parseMeasurement(raw, { type: 'height' })).toMatchObject({
      value: 70, // 5 × 12 + 10; PARSING.md Ranges omits only the weight range.
      unit: 'in',
    });
  });

  // AFA-74 and PARSING.md: an omitted range does not take an independent measurement's unit.
  it.each(['5/2-180 lbs; 70 kg', '180-5/2 lbs; 70 kg'])(
    'keeps the later measurement after %s',
    raw => {
      expect(parseMeasurement(raw)).toMatchObject({ value: 70, unit: 'kg' });
    }
  );

  it('normalizes the approved fractional weight', () => {
    expect(parseMeasurement('5 ft (10/180 lbs)', { normalizedUnit: 'kg' })).toMatchObject({
      value: 0.02519957611111111, // (10 / 180) × 0.45359237
      unit: 'kg',
      matches: [{ value: 0.05555555555555555, unit: 'lb' }],
    });
  });

  it('keeps the independent height before a fractional weight', () => {
    expect(parseMeasurement('5 ft (10/180 lbs)', { type: 'height' })).toMatchObject({
      value: 5,
      unit: 'ft',
      matches: [{ value: 5, unit: 'ft' }],
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

  // Independent probes: PARSING.md Ranges omits the complete range, including its fractions.
  it.each([
    '1/2-3/4 lb',
    '1⁄2-3⁄4 lb',
    '1/2 - 3/4 lb',
    '1/2–3/4 lb',
    '1/2-1 1/2 lb',
    '1 1/2-2 1/2 lb',
    '5.5 ½-6 ft',
    '5½2-6 ft',
    '1/2-5/2 lb',
    'kg 5/2-180',
    '5/2-1/2 lb',
  ])('omits every endpoint of the fraction range in %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it.each([
    ['1/2-3/4 lb; actual 70 kg', 70, 'kg'],
    ['1/2-3/4 lb; actual 2 lb', 2, 'lb'],
    ['6 ft 1/2-3/4 11 in', 83, 'in'], // 6 × 12 + 11
  ] as const)('keeps the separate measurement around %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit });
  });

  // Second review: fractional endpoints do not take the preceding independent inches.
  it.each([
    "5'10/180-190½ lbs",
    "5'10/180-190 1/2 lbs",
    "5'10/180-3/4 lbs",
    "5'10/180-190½",
    '5 ft 10/180-190½ lbs',
    '5′10/180-190 1⁄2 lbs',
  ])('preserves height before fractional weight endpoints in %s', raw => {
    expect(parseMeasurement(raw, { type: 'height' })).toMatchObject({ value: 70, unit: 'in' });
  });

  it('keeps disagreeing independent inches around an integer weight range', () => {
    // PARSING.md More Than One Measurement: 5 × 12 + 10 conflicts with 11 inches.
    expect(parseMeasurement("5'10/180-190 11 in", { type: 'height' })).toBeNull();
  });

  it.each([
    '6 ft 1/2-3/4 lbs',
    '6 ft 1/2-3/4 in',
    '6 ft 1/2-3/4',
    '6 ft 1/2-3/4 elevenin',
    '6 ft 1/2-3/4 eleven"foo',
  ])('retains the existing slash-height interpretation in %s', raw => {
    // Existing slash-height syntax: 6 × 12 + 1 inch; omit the range after the slash.
    expect(parseMeasurement(raw, { type: 'height' })).toMatchObject({ value: 73, unit: 'in' });
  });

  // A separate explicit inch component identifies the fraction range to omit (6 × 12 + 11).
  it.each([
    '6 ft 1/2-1 1/2 11 in',
    '6 ft 1/2-3/4 eleven in',
    '6 ft 1/2-3/4 ELEVEN INCHES',
    '6 ft 1/2-3/4 11"',
    "6 ft 1/2-3/4 11''",
  ])('retains the separate inch component after %s', raw => {
    expect(parseMeasurement(raw, { type: 'height' })).toMatchObject({ value: 83, unit: 'in' });
  });

  // A sentence period after an endpoint is punctuation, not a continuing decimal.
  it.each(['5.5 ½-180. lbs', '5½2-180. lbs', '5/2-180. lbs', '5½2–180. lbs'])(
    'omits malformed fractional ranges with trailing punctuation in %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  // Reject the malformed fragment locally; the following 1 / 2 pound remains 0.5 pound.
  it.each(['5.5½ 1/2 lb', '5.5 ½ 1⁄2 lb', '3 5.5½ 1/2 lb'])(
    'preserves a proper fraction after a generated rejection in %s',
    raw => {
      expect(parseMeasurement(raw)).toMatchObject({ value: 0.5, unit: 'lb' });
    }
  );
});
