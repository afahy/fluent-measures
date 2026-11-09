// AFA-250 approved policy revision of main c670d12. Original inputs, assertions and
// AFA-202/247/248 rationale are archived in main-migration-preparation/main-original.
// Historical comments below describe the earlier contract; the migrated null cases
// reject the whole entry under the rule named by their test and exact ledger row.
import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

describe('worded range boundaries', () => {
  // AFA-248 leaves number-word endpoints outside its numeric-range grammar.
  // Preserve the complete supported number: 2*100, 2*100+50, 2*1000, or 2+1/2.
  it.each([
    ['1 to 2 hundred lbs'],
    ['between 1 and 2 hundred lbs'],
    ['from 1 to 2 thousand lbs'],
    ['1 to 2 hundred and fifty lbs'],
    ['1 to 2 and a half lbs'],
    ['1 to 2-hundred lbs'],
    ['1 to 2. hundred lbs'],
    ['1 to 2... hundred lbs'],
    ['1 to 2hundred lbs'],
    ['between 1 and 2hundred lbs'],
    ['1 to 2.5hundred lbs'],
    ['one hundred and 50 to 200 lbs'],
    ['one hundred and 50 to 2 hundred lbs'],
  ] as const)('rejects %s under AFA-250: range', raw => {
    expect(parseMeasurement(raw)).toBeNull();
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
  ] as const)('rejects %s under AFA-250: range', raw => {
    expect(parseMeasurement(raw, { type: 'height' })).toBeNull();
    expect(parseMeasurement(raw, { type: 'weight' })).toBeNull();
  });

  it.each(['6 ft 1/2 to 3/4 11 in', '6 ft 1/2 to 1 11 in', '6 ft 1 to 3/4 11 in'] as const)(
    'rejects %s under AFA-250: range',
    raw => {
      expect(parseMeasurement(raw, { type: 'height' })).toBeNull();
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

  it.each(['5 ft 10 to 20 lbs', '5 ft 10 to 20 in'] as const)(
    'rejects %s under AFA-250: range',
    raw => {
      expect(parseMeasurement(raw, { type: 'height' })).toBeNull();
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

  it.each([
    'lbs 150 to 180.',
    'lbs from 150 to 180.',
    'lbs between 150 and 180.',
    '150 to 180. lbs',
    'between 150 and 180. pounds',
    'from 72.5 to 80.5. kg',
    '150 to 180... lbs',
  ])('omits a complete range before a punctuation period: %s', raw => {
    expect(parseMeasurement(raw, { type: 'weight' })).toBeNull();
  });

  it.each([
    'I weigh between 150 and 180.',
    'Weight is 150 to 180.',
    'Weight is between 150 and 180.',
    '150 to 180.',
  ])('does not infer an unqualified range endpoint: %s', raw => {
    expect(parseMeasurement(raw, { type: 'weight', defaultUnit: 'lb' })).toBeNull();
  });

  it.each(['lbs 150 to 180. 70 kg', '150 to 180. lbs; 70 kg', '150 to 180... lbs; 70 kg'] as const)(
    'rejects %s under AFA-250: range',
    raw => {
      expect(parseMeasurement(raw, { type: 'weight' })).toBeNull();
    }
  );

  it.each(['1 to 2..5 kg', '1 to 2...5 kg', '1 to 2.hundred lbs'])(
    'does not remove the prefix of a malformed decimal token: %s',
    raw => {
      expect(parseMeasurement(raw, { type: 'weight' })).toBeNull();
    }
  );
});
