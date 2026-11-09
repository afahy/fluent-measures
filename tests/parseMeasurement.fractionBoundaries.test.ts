// AFA-250: recovery expectations now follow the approved complete-entry contract in PARSING.md.
// Earlier ticket rationales below describe their historical extraction contract; original
// assertions are retained separately under design/afa-250.
import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions } from '../src';

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

  it('rejects a numeric run with two slash separators', () => {
    expect(parseMeasurement('1⁄2/180 lbs')).toBeNull();
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
    'rejects the complete entry %s (AFA-250)',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  it.each(['5 (ft) 10/180 lbs', '5 [ft] 10/180 lbs'])(
    'rejects the complete entry %s (AFA-250)',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );
  it.each([
    '5 feet (10/180 lbs)',
    '5 foot [10/180 lbs]',
    '5ft (10/180lbs)',
    '5 FT, 10/180 LBS',
    "5' (10/180 lbs)",
    '60" (10/180 lbs)',
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
  it.each(['left (1/2 lbs)', 'heft (1/2 lbs)', 'weight, 1/2 lbs'])(
    'rejects the complete entry %s (AFA-250)',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
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
    ["6 ft, 1/2''", 72.5],
  ] as const)('keeps the explicit fraction of an inch in %s', (raw, value) => {
    expect(parseMeasurement(raw, { type: 'height' })).toMatchObject({ value, unit: 'in' });
  });

  // Review findings: closing prose quotes are not height marks; a weight range owns no inches.
  it.each(['"weight" (1/2 lbs)', 'weight "today", 1/2 lbs'])(
    'rejects the complete entry %s (AFA-250)',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  it.each([
    "5'10/180-190 lbs",
    '5 ft 10/180-190 lbs',
    '5 feet 10/180–190 lbs',
    "five'10/180-190 lbs",
    '5 FOOT 10/180-190 lbs',
  ])('rejects the complete entry %s (AFA-250)', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  // AFA-74 and PARSING.md: an omitted range does not take an independent measurement's unit.
  it.each(['180-5/2 lbs; 70 kg'])('rejects the complete entry %s (AFA-250)', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });
  it.each(['5/2-180 lbs; 70 kg'])(
    'rejects a malformed range before a later measurement in %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
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
    expect(parseMeasurement('5½2', { type: 'weight', defaultUnit: 'lb' })).toBeNull();
    expect(parseMeasurement('5.5 ½', { type: 'height', defaultUnit: 'in' })).toBeNull();
    expect(parseMeasurement('5½', { type: 'weight', defaultUnit: 'lb' })).toMatchObject({
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

  it.each(['1/2-3/4 lb; actual 70 kg', '1/2-3/4 lb; actual 2 lb', '6 ft 1/2-3/4 11 in'])(
    'rejects the complete entry %s (AFA-250)',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  // Second review: fractional endpoints do not take the preceding independent inches.
  it.each([
    "5'10/180-190½ lbs",
    "5'10/180-190 1/2 lbs",
    "5'10/180-3/4 lbs",
    "5'10/180-190½",
    '5 ft 10/180-190½ lbs',
    '5′10/180-190 1⁄2 lbs',
  ])('rejects the complete entry %s (AFA-250)', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it('rejects an integer range surrounded by inch fragments', () => {
    // PARSING.md More Than One Measurement: 5 × 12 + 10 conflicts with 11 inches.
    expect(parseMeasurement("5'10/180-190 11 in", { type: 'height' })).toBeNull();
  });

  it.each([
    '6 ft 1/2-3/4 lbs',
    '6 ft 1/2-3/4 in',
    '6 ft 1/2-3/4',
    '6 ft 1/2-3/4 elevenin',
    '6 ft 1/2-3/4 eleven"foo',
  ])('rejects the complete entry %s (AFA-250)', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  // A separate explicit inch component identifies the fraction range to omit (6 × 12 + 11).
  it.each([
    '6 ft 1/2-1 1/2 11 in',
    '6 ft 1/2-3/4 eleven in',
    '6 ft 1/2-3/4 ELEVEN INCHES',
    '6 ft 1/2-3/4 11"',
    "6 ft 1/2-3/4 11''",
  ])('rejects the complete entry %s (AFA-250)', raw => {
    expect(parseMeasurement(raw)).toBeNull();
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
    'rejects the complete entry %s (AFA-250)',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );
});

// AFA-250: retain every original explicit selector/inference path when recovery becomes null.
it.each([
  ['5 (ft) 10/180 lbs', { type: 'weight' }],
  ['5 [ft] 10/180 lbs', { type: 'weight' }],
  ["5'10/180-190 lbs", { type: 'height' }],
  ['5 ft 10/180-190 lbs', { type: 'height' }],
  ['5 feet 10/180–190 lbs', { type: 'height' }],
  ["five'10/180-190 lbs", { type: 'height' }],
  ['5 FOOT 10/180-190 lbs', { type: 'height' }],
  ["5'10/180-190½ lbs", { type: 'height' }],
  ["5'10/180-190 1/2 lbs", { type: 'height' }],
  ["5'10/180-3/4 lbs", { type: 'height' }],
  ["5'10/180-190½", { type: 'height' }],
  ['5 ft 10/180-190½ lbs', { type: 'height' }],
  ['5′10/180-190 1⁄2 lbs', { type: 'height' }],
  ['6 ft 1/2-3/4 lbs', { type: 'height' }],
  ['6 ft 1/2-3/4 in', { type: 'height' }],
  ['6 ft 1/2-3/4', { type: 'height' }],
  ['6 ft 1/2-3/4 elevenin', { type: 'height' }],
  ['6 ft 1/2-3/4 eleven"foo', { type: 'height' }],
  ['6 ft 1/2-1 1/2 11 in', { type: 'height' }],
  ['6 ft 1/2-3/4 eleven in', { type: 'height' }],
  ['6 ft 1/2-3/4 ELEVEN INCHES', { type: 'height' }],
  ['6 ft 1/2-3/4 11"', { type: 'height' }],
  ["6 ft 1/2-3/4 11''", { type: 'height' }],
] as const)('rejects incomplete entry %s with original options %j', (raw, options) => {
  expect(parseMeasurement(raw, options)).toBeNull();
});

// AFA-277: quotation marks and brackets cannot surround an entry, a measurement or a number.
it.each([
  ['5 ft, (10⁄180 lbs)', { type: 'weight' }],
  ['weight (1/2 lbs)', {}],
  ['6 ft (1/2) in', { type: 'height' }],
] as const)('rejects the wrapped %s', (raw, options: ParseOptions) => {
  expect(parseMeasurement(raw, options)).toBeNull();
});
