import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

describe('boundaries between compound height parts', () => {
  // AFA-51: the maintainer chose ordinary words other than "and", and semicolons,
  // as boundaries. PARSING.md now requires a complete entry, so independent heights
  // reject regardless of agreement and no valid prefix or suffix can be recovered.
  it.each([
    '5 ft; actual 11 in',
    'height 5 ft; note 11 in',
    '5 ft; 11 in',
    '5 ft actual 11 in',
    '5 ft note 11 in',
    '5 ft and actual 11 in',
    '5 ft and; 11 in',
    '5 ft; and 11 in',
    'five feet tall, eleven inches',
    '5′ tall, 11″',
    '1 m tall, 80 cm',
    'm: 1; cm: 80',
    'm: 1 actual cm: 80',
    '5 ft tall, 2 in shorter than last year',
    '5 ft tall, with 2 in heels',
    '6 ft and ranked 3 in the state',
    '6 ft, top 10 in the class',
  ])('rejects independent heights in %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
    expect(parseMeasurement(raw, { type: 'height', normalizedUnit: 'cm' })).toBeNull();
    expect(parseMeasurement(raw, { type: 'height', defaultUnit: 'in' })).toBeNull();
  });

  it('applies the same boundary to fuzzy unit names', () => {
    expect(parseMeasurement('5 foots tall, 2 inc', { fuzziness: 2 })).toBeNull();
  });

  it.each(['5 ft τώρα 11 in', '5 ft сейчас 11 in', '5 ft 实际 11 in', '5 ft à 11 in'])(
    'keeps independent heights apart across the word in %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  // Unicode letters are not punctuation. None of these tokens spells a supported unit
  // with its number: in particular, micrometers must not be read as meters.
  it.each(['5µm', '5éft', 'é5 ft', '5 fté', 'µ5 kg', '70kgé', '5 µft', 'é5ft', 'fiveé ft'])(
    'does not extract a measurement by deleting letters from %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  // PARSING.md Complete Entries: unknown words invalidate the whole entry, including
  // when an intact number-unit pair remains before or after the attached word.
  it.each(['5 fté 11 in', '5éft 11 in', '5 ft 11éin'])(
    'rejects the incomplete entry beside an attached word in %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  // PARSING.md Semicolons: an invalid or zero independent expression is never discarded.
  it.each(['0 m; actual 80 cm', '0 m actual 80 cm', '0 m; 80 cm'])(
    'rejects the independent zero measurement in %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  // The complete-entry policy on main retires recovery across semicolons, ranges,
  // and intervening measurements. Keep every original preservation input as a rejection.
  it.each([
    '5; ft 11; in',
    '6 1-2 ft 3 in',
    '6 ft 1-2 11 in',
    '6 1-2 ft; 3 in',
    '5 ft 8 lbs 3 in',
    '5 ft eight pounds 3 in',
    '5 ft one hundred grams 3 in',
  ])('rejects recovery across an interrupted compound in %s', raw => {
    expect(parseMeasurement(raw, { type: 'height' })).toBeNull();
  });

  // These are the complete compounds shared by the ticket and the current specification.
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
    'rejects the invalid independent measurement in %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  // PARSING.md More Than One Measurement: duplicate heights and invalid mixed entries
  // reject even when the values agree or a selector requests the other measurement type.
  it('rejects agreeing conversions and type selection across ordinary words', () => {
    expect(parseMeasurement('5 ft tall, or 60 in')).toBeNull();
    expect(parseMeasurement('5 ft tall, with 2 in heels, 150 lbs', { type: 'weight' })).toBeNull();
  });

  it('rejects a separate zero-inch measurement after a semicolon', () => {
    expect(parseMeasurement('5 ft; 0 in')).toBeNull();
  });
});
