// AFA-250 approved complete-entry migration; original #242 literals/results are archived.
import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

describe('compact units and metric height shorthand', () => {
  // Ticket inputs; totals are feet × 12 + inches, or meters × 100 + centimeters.
  it.each([
    ['5ft11', 5, 11, 71],
    ['6ft2', 6, 2, 74],
    ['6.0ft2', 6, 2, 74],
    ['5ft11in', 5, 11, 71],
    ['6ft1in', 6, 1, 73],
    ['5ft11"', 5, 11, 71],
    ['6foot2', 6, 2, 74],
    ['5ft.11in.', 5, 11, 71],
  ] as const)('reads both parts of %s', (raw, feet, inches, value) => {
    expect(parseMeasurement(raw)).toEqual({
      value,
      unit: 'in',
      type: 'height',
      raw,
      matches: [
        { value: feet, unit: 'ft' },
        { value: inches, unit: 'in' },
      ],
    });
    expect(parseMeasurement(raw, { type: 'height', normalizedUnit: 'cm' })?.value).toBeCloseTo(
      value * 2.54
    );
    expect(parseMeasurement(raw, { type: 'weight' })).toBeNull();
  });

  it.each([
    ['1m75', 75, 175],
    ['1m80', 80, 180],
    ['1.0m80', 80, 180],
    ['1 m 80', 80, 180],
    ['1 meter 80', 80, 180],
    ['one meter eighty', 80, 180],
  ] as const)('reads bare centimeters in %s', (raw, centimeters, value) => {
    const expected = {
      value,
      unit: 'cm',
      type: 'height',
      raw,
      matches: [
        { value: 1, unit: 'm' },
        { value: centimeters, unit: 'cm' },
      ],
    };
    expect(parseMeasurement(raw)).toEqual(expected);
    expect(parseMeasurement(raw, { normalizedUnit: 'cm' })).toEqual(expected);
    expect(parseMeasurement(raw, { type: 'height', normalizedUnit: 'm' })?.value).toBeCloseTo(
      value / 100
    );
    expect(parseMeasurement(raw, { type: 'weight' })).toBeNull();
  });

  it.each([
    ['70kgs', 70, 'kg', 'weight'],
    ['175cms', 175, 'cm', 'height'],
  ] as const)('accepts the short plural in %s', (raw, value, unit, type) => {
    expect(parseMeasurement(raw)).toEqual({ value, unit, type, raw, matches: [{ value, unit }] });
    expect(parseMeasurement(raw, { type, normalizedUnit: unit })?.value).toBe(value);
  });

  // The independent probe combined ticket shorthand with PARSING.md's comma/ownership rules.
  it.each([
    ['5ft11,5in', 71.5, 'in', 5, 'ft', 11.5],
    ['5FT11,05in', 71.05, 'in', 5, 'ft', 11.05],
    ['5ft.11,5in.', 71.5, 'in', 5, 'ft', 11.5],
    ['1m80,5', 180.5, 'cm', 1, 'm', 80.5],
    ['1m80,05', 180.05, 'cm', 1, 'm', 80.05],
    ['1m80,5cms', 180.5, 'cm', 1, 'm', 80.5],
  ] as const)(
    'independent probe: keeps the decimal comma in %s',
    (raw, value, unit, first, large, part) => {
      // 5 × 12 + 11.5 = 71.5 inches; 1 × 100 + 80.5 = 180.5 centimeters.
      expect(parseMeasurement(raw, { normalizedUnit: unit })).toEqual({
        value,
        unit,
        type: 'height',
        raw,
        matches: [
          { value: first, unit: large },
          { value: part, unit },
        ],
      });
    }
  );

  it.each(['1 m 80;kg', '1 m 80;kgs', '1 m 80 (kg)'])(
    'rejects interrupted or unseparated expressions: %s',
    raw => {
      expect(parseMeasurement(raw, { normalizedUnit: 'cm' })).toBeNull();
      expect(parseMeasurement(raw, { type: 'weight' })).toBeNull();
    }
  );

  it.each(['1 m 80 (m)', '1 m 80;in'])(
    'independent probe: preserves conflicting explicit heights in %s',
    raw => {
      // Neither 80 meters nor 80 inches agrees with 1 meter within the documented 1%.
      expect(parseMeasurement(raw, { type: 'height' })).toBeNull();
    }
  );

  it.each(['abc5ft11,5in', 'phase2,5in'])(
    'rejects unrelated identifiers before numeric commas: %s',
    raw => {
      // AFA-250 retains the identifier instead of extracting the final number.
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  it.each(['5ft11,12,345in', '1m80,12,345'])(
    'rejects malformed comma groups in compact parts: %s',
    raw => {
      // A two-digit group can only be the final decimal part, not an interior thousands group.
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  it.each([
    ['5ft½', 60.5, 'in'],
    ['1m½', 100.5, 'cm'],
    ['5ft1½', 61.5, 'in'],
    ['1m80½', 180.5, 'cm'],
  ] as const)('keeps compact fractions after moving the comma boundary: %s', (raw, value, unit) => {
    // The same shorthand arithmetic, with the documented Unicode fraction ½ = 0.5.
    expect(parseMeasurement(raw)).toMatchObject({ value, unit });
  });

  it.each([
    ['150lbs', 150, 'lb'],
    ['1.83m', 1.83, 'm'],
    ['73.2kg', 73.2, 'kg'],
    ['5\'11"', 71, 'in'],
    ['1 m', 1, 'm'],
    ['1 m 80 cm', 180, 'cm'],
    ['5 ft 11 in', 71, 'in'],
  ] as const)('preserves %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit });
  });

  it.each(['M 28', 'kg-70.5', 'A4 paper', 'B12 dose 5 mg', '5.11'])('does not infer %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
    expect(parseMeasurement(raw, { type: 'height' })).toBeNull();
  });

  it.each([
    '1m1',
    '1m99',
    '1m99.5',
    '1meter80',
    '1meters80',
    '1metre80',
    '1metres80',
    '1 m80',
    '1m.80',
    'one metre eighty',
    '1 m 80 cm',
    '1m80cms',
  ])('reads metric variants: %s', raw => {
    const part = raw === '1m1' ? 1 : raw === '1m99' ? 99 : raw === '1m99.5' ? 99.5 : 80;
    expect(parseMeasurement(raw)).toMatchObject({
      value: 100 + part,
      unit: 'cm',
      matches: [
        { value: 1, unit: 'm' },
        { value: part, unit: 'cm' },
      ],
    });
  });

  it.each([
    '1 m 0',
    '1 m 100',
    '1 m 101',
    '1 m -80',
    '1 m; 80',
    '1 m 80 kg',
    '1 m 80 oz',
    '1 m eighty grams',
  ])('rejects incomplete, signed or unsupported smaller parts: %s', raw => {
    expect(parseMeasurement(raw, { type: 'height' })).toBeNull();
  });

  it.each(['1m80kg', '1m80kgs'])('rejects compact pairs without a separator: %s', raw => {
    expect(parseMeasurement(raw, { type: 'height' })).toBeNull();
    expect(parseMeasurement(raw, { type: 'weight' })).toBeNull();
  });

  it.each(['0m80', '0meter80', '0 meter 80', 'zero meters eighty'])(
    'keeps a zero larger part in the same shorthand: %s',
    raw => {
      // The same next-part rule: 0 × 100 + 80 = 80 centimeters.
      expect(parseMeasurement(raw)).toMatchObject({ value: 80, unit: 'cm' });
    }
  );

  it.each(['0 meter 100', 'zero meters one hundred'])(
    'does not turn an oversized bare smaller part into meters: %s',
    raw => {
      // As for bare inches below 12, bare centimeters must be below 100.
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  it.each([
    'abc5ft11',
    'a1m80',
    '_1m80',
    'é1m80',
    // Combining marks are part of the identifier, just as the precomposed accent above is.
    'e\u03011m80',
    'e\u03015ft11',
    '١1m80',
    'xft11',
    'abc1.5ft11',
    '_1.5m80',
    '5..5ft11',
  ])('keeps identifiers: %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it.each(['-1m80', '-5ft11', '1.5m80', '5.5ft6in', '1m80in'])(
    'rejects signed or conflicting parts: %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  it.each(['5feet11', '5 ft11', '5FT11', 'five ft11', 'ft5 11'])('reads feet variants: %s', raw => {
    expect(parseMeasurement(raw)).toMatchObject({ value: 71, unit: 'in' });
  });

  it.each([0, 1, 1.5, 2, Infinity])('keeps short plurals exact at fuzziness %s', fuzziness => {
    expect(parseMeasurement('kgs seventy', { fuzziness })).toMatchObject({ value: 70, unit: 'kg' });
    expect(parseMeasurement('cms 175', { fuzziness })).toMatchObject({ value: 175, unit: 'cm' });
    expect(parseMeasurement('70 kgsx', { fuzziness })).toBeNull();
    expect(parseMeasurement('175 cmsx', { fuzziness })).toBeNull();
  });

  // Composition with the merged spoken-decimal and numeric-range rules. Expectations use
  // meters × 100 + centimeters, feet × 12 + inches, and explicit suffix/field ownership.
  it.each([
    ['1 m eighty point five', { normalizedUnit: 'cm' }, 180.5, 'cm'],
    ['one meter eighty point five', { normalizedUnit: 'cm' }, 180.5, 'cm'],
    ['1m80 point five', { normalizedUnit: 'cm' }, 180.5, 'cm'],
    ['5ft eleven point five', { type: 'height' }, 71.5, 'in'],
    ['5ft11 point five', { type: 'height' }, 71.5, 'in'],
    ['ft5 eleven point five', { type: 'height' }, 71.5, 'in'],
  ] as const)(
    'composes compact parts with decimal/range parsing: %s',
    (raw, options, value, unit) => {
      expect(parseMeasurement(raw, options)).toMatchObject({ value, unit });
    }
  );

  // AFA-250 approved policy: range cannot reconstruct a height. Original literals/results are archived.
  it.each(['6 1-2ft3in'])('rejects %s: range cannot reconstruct a height', raw => {
    expect(parseMeasurement(raw)).toBeNull();
    expect(parseMeasurement(raw, { type: 'height', normalizedUnit: 'cm' })).toBeNull();
    expect(parseMeasurement(raw, { type: 'weight' })).toBeNull();
  });

  // AFA-250 approved policy: fractional larger part with a bare zero. Original literals/results are archived.
  it.each(['½ft0', '1½ft0', '1½m0'])('rejects %s: fractional larger part with a bare zero', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  // AFA-250 approved policy: unrelated prose. Original literals/results are archived.
  it.each(['5G phone, 180 lbs'])('rejects %s: unrelated prose', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  // AFA-250 approved policy: range fragments. Original literals/results are archived.
  it.each(['6ft1-2in', '6 1-2 ft 3 in'])('rejects %s: range fragments', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it.each([
    ['1 m 80 two hundred point five pounds', { type: 'height' }],
    ['1 m eighty point five;kg', { normalizedUnit: 'cm' }],
    ['1 m eighty point five;kg', { type: 'weight' }],
    ['5ft10/180 to 200 lbs', { type: 'height' }],
    ['6ft1/2 to 3/4 11 in', { type: 'height' }],
    ['1 m -eighty point five', { type: 'height' }],
    ['1 m; eighty point five', { type: 'height' }],
    ['1 m one point twenty', { type: 'height' }],
  ] as const)('rejects incomplete decimal/range entries: %s', (raw, options) => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });
});
