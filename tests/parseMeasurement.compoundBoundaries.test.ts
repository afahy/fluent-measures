import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

describe('boundaries between compound height parts', () => {
  // AFA-51: the maintainer chose ordinary words other than "and", and semicolons,
  // as boundaries. Separate 5 ft and 11 in disagree, so they must not become 71 in.
  it.each([
    '5 ft; actual 11 in',
    'height 5 ft; note 11 in',
    '5 ft; 11 in',
    '5 ft actual 11 in',
    '5 ft and actual 11 in',
    'five feet tall, eleven inches',
    '5′ tall, 11″',
    '1 m tall, 80 cm',
    'm: 1; cm: 80',
    'm: 1 actual cm: 80',
    '5 ft tall, 2 in shorter than last year',
    '5 ft tall, with 2 in heels',
  ])('rejects independent heights in %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
    expect(parseMeasurement(raw, { type: 'height', normalizedUnit: 'cm' })).toBeNull();
    expect(parseMeasurement(raw, { type: 'height', allowUnqualified: true })).toBeNull();
  });

  it('applies the same boundary to fuzzy unit names', () => {
    expect(parseMeasurement('5 foots tall, 2 inc', { fuzziness: 2 })).toBeNull();
  });

  it.each(['0 m; actual 80 cm', '0 m actual 80 cm', '0 m; 80 cm'])(
    'leaves only the nonzero measurement in %s',
    raw => {
      expect(parseMeasurement(raw)).toEqual({
        value: 80,
        unit: 'cm',
        type: 'height',
        raw,
        matches: [{ value: 80, unit: 'cm' }],
      });
    }
  );

  // These are the ticket's must-not-change cases, plus each compound input form.
  // Expected totals are feet * 12 + inches, or meters * 100 + centimeters.
  it.each([
    ['5 ft 11 in', 71, 'in', 5, 'ft', 11],
    ['5 ft and 11 in', 71, 'in', 5, 'ft', 11],
    ['five foot ten', 70, 'in', 5, 'ft', 10],
    ['5\'11"', 71, 'in', 5, 'ft', 11],
    ['5′11″', 71, 'in', 5, 'ft', 11],
    ["5′11''", 71, 'in', 5, 'ft', 11],
    ['5-foot-11', 71, 'in', 5, 'ft', 11],
    ['5 ft-11', 71, 'in', 5, 'ft', 11],
    ['5\'-11"', 71, 'in', 5, 'ft', 11],
    ['5 ft 11', 71, 'in', 5, 'ft', 11],
    ['5-11', 71, 'in', 5, 'ft', 11],
    ['1 m 80 cm', 180, 'cm', 1, 'm', 80],
    ['m: 1 cm: 80', 180, 'cm', 1, 'm', 80],
    ['1 m and 80 cm', 180, 'cm', 1, 'm', 80],
    ['5; ft 11; in', 71, 'in', 5, 'ft', 11],
    ['6 1-2 ft 3 in', 75, 'in', 6, 'ft', 3],
    ['6 ft 1-2 11 in', 83, 'in', 6, 'ft', 11],
    ['6 1-2 ft; 3 in', 75, 'in', 6, 'ft', 3],
  ] as const)('preserves the compound %s', (raw, value, unit, larger, largerUnit, smaller) => {
    expect(parseMeasurement(raw, { type: 'height' })).toEqual({
      value,
      unit,
      type: 'height',
      raw,
      matches: [
        { value: larger, unit: largerUnit },
        { value: smaller, unit },
      ],
    });
  });

  it.each(['0 feet; 11 inches', 'invalid -5 ft; 11 inches'])(
    'preserves the valid independent measurement in %s',
    raw => {
      expect(parseMeasurement(raw)).toEqual({
        value: 11,
        unit: 'in',
        type: 'height',
        raw,
        matches: [{ value: 11, unit: 'in' }],
      });
    }
  );

  it('keeps agreeing conversions and type selection across ordinary words', () => {
    expect(parseMeasurement('5 ft tall, or 60 in')).toMatchObject({
      value: 5,
      unit: 'ft',
      matches: [{ value: 5, unit: 'ft' }],
    });
    expect(
      parseMeasurement('5 ft tall, with 2 in heels, 150 lbs', { type: 'weight' })
    ).toMatchObject({ value: 150, unit: 'lb', matches: [{ value: 150, unit: 'lb' }] });
  });
});
