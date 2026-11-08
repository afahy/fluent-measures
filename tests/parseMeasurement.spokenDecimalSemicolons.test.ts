// AFA-250 approved policy revision of main c670d12. Original inputs, assertions and
// AFA-202/247/248 rationale are archived in main-migration-preparation/main-original.
// Historical comments below describe the earlier contract; the migrated null cases
// reject the whole entry under the rule named by their test and exact ledger row.
import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

// AFA-247 final review: a semicolon separates independent fields, but may also sit
// between a complete number and its unit. Values come from those fields and decimal arithmetic.
describe('semicolon boundaries after spoken decimals', () => {
  it.each([
    ['age twenty point five; 80 kg'],
    ['age twenty point five; 1.8 m'],
    ['age twenty point 5; 80 kg'],
    ['age twenty point five;80 kg'],
    ['age twenty point five; eighty kg'],
    ['age twenty point five; point five kg'],
    ['age twenty point five; .5 kg'],
    ['age twenty point five; 80;kg'],
    ['age twenty point five; kg=80'],
    ['age twenty point five; kg: 80'],
    ['age twenty point five; 70 kg (154 lbs)'],
  ] as const)('rejects %s under AFA-250: prose', input => {
    expect(parseMeasurement(input)).toBeNull();
  });

  it.each([['kg seventy point five; 70.5 kg']] as const)(
    'rejects %s under AFA-250: duplicate',
    input => {
      expect(parseMeasurement(input)).toBeNull();
    }
  );

  it.each([
    ['80;kg'],
    ['70.5;kg'],
    ['seventy point five;kg'],
    ['seventy point five; kg'],
    ['kg seventy point five;'],
    ['5 ft eleven point five;in'],
  ] as const)('rejects %s under AFA-250: semicolon', input => {
    expect(parseMeasurement(input)).toBeNull();
  });

  it.each([
    'age twenty point five; -80 kg',
    'age twenty point five; −80 kg',
    'age twenty point five; -point five kg',
    'kg seventy point five; 72 kg',
  ])('rejects signed or disagreeing measurements in %s', input => {
    expect(parseMeasurement(input)).toBeNull();
  });
});
