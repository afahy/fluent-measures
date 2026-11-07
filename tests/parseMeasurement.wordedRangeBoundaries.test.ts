import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

describe('worded range boundaries', () => {
  // AFA-248 leaves number-word endpoints outside its numeric-range grammar.
  // Preserve the complete supported number: 2*100, 2*100+50, 2*1000, or 2+1/2.
  it.each([
    ['1 to 2 hundred lbs', 200],
    ['between 1 and 2 hundred lbs', 200],
    ['from 1 to 2 thousand lbs', 2000],
    ['1 to 2 hundred and fifty lbs', 250],
    ['1 to 2 and a half lbs', 2.5],
    ['1 to 2-hundred lbs', 200],
    ['one hundred and 50 to 200 lbs', 200],
    ['one hundred and 50 to 2 hundred lbs', 200],
  ] as const)('does not remove part of a number-word endpoint: %s', (raw, value) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit: 'lb' });
  });

  // The slash after an implied inch component separates the weight field, as in
  // the existing dash-range contract. Height is 5*12+10, never only five feet.
  it.each([
    "5'10/180 to 200 lbs",
    "5'10/180 to 200 lbs, 70 in",
    '5 ft 10/180 to 200 lbs',
    '5 feet 10/180 to 200 lbs',
    "5'10/from 180 to 200 lbs",
    "5'10/between 180 and 200 lbs",
  ])('keeps the independent inches in %s', raw => {
    expect(parseMeasurement(raw, { type: 'height' })).toMatchObject({
      value: 70,
      unit: 'in',
      matches: [
        { value: 5, unit: 'ft' },
        { value: 10, unit: 'in' },
      ],
    });
    expect(parseMeasurement(raw, { type: 'weight' })).toBeNull();
  });

  it.each(['6 ft 1/2 to 3/4 11 in', '6 ft 1/2 to 1 11 in', '6 ft 1 to 3/4 11 in'])(
    'keeps a fraction range separate from following inches: %s',
    raw => {
      expect(parseMeasurement(raw, { type: 'height' })).toMatchObject({
        value: 83,
        unit: 'in',
        matches: [
          { value: 6, unit: 'ft' },
          { value: 11, unit: 'in' },
        ],
      });
    }
  );

  it.each(['kg 1/2 to 3/4', 'kg from 1/2 to 3/4', 'kg between 1/2 and 3/4'])(
    'does not reinterpret a unit-prefixed fractional range: %s',
    raw => {
      expect(parseMeasurement(raw, { type: 'weight' })).toBeNull();
    }
  );

  it.each(['height 6 ft and 150 to 180 lbs', 'and 150 to 180 lbs'])(
    'does not treat a prose conjunction as a number-word endpoint: %s',
    raw => {
      expect(parseMeasurement(raw, { type: 'weight' })).toBeNull();
    }
  );

  it.each(['5 ft 10 to 20 lbs', '5 ft 10 to 20 in'])(
    'keeps a complete range endpoint out of the independent height: %s',
    raw => {
      expect(parseMeasurement(raw, { type: 'height' })).toMatchObject({
        value: 5,
        unit: 'ft',
        matches: [{ value: 5, unit: 'ft' }],
      });
    }
  );

  // Two slash separators are not one fraction. Keep both conflicting inch readings
  // visible rather than discarding the ten and accepting 5*12+11.
  it.each(['5 ft 10/180/200 to 20 11 in', "5'10/180/200 to 3/4 11 in"])(
    'does not consume another slash-separated field in %s',
    raw => {
      expect(parseMeasurement(raw, { type: 'height' })).toBeNull();
    }
  );
});
