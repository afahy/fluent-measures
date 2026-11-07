// AFA-250: recovery expectations now follow the approved complete-entry contract in PARSING.md.
// Earlier ticket rationales below describe their historical extraction contract; original
// assertions are retained separately under design/afa-250.
import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

// AFA-130: after a number, "in" means inches, also in ordinary text (README, AFA-67). These pin
// what such inches do next to another measurement. Each reason is a rule or an option in the
// README or PARSING.md, or the ticket's row.
describe('"N in" in ordinary text next to another measurement', () => {
  it.each(['6 ft and ranked 3 in the state', '6 ft, top 10 in the class'])(
    'rejects the complete entry %s (AFA-250)',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  // The `type` option reads only that measurement (ParseOptions). Without a type, the corpus
  // accepts the height, the weight or null for text with both (multiple-height-weight-no-type),
  // and the ticket's row gives 10 in, so this test pins that.
  it.each([
    [{ type: 'weight' }, 180, 'lb'],
    [{ type: 'height' }, 10, 'in'],
    [{}, 10, 'in'],
  ] as const)('reads 180 lbs, top 10 in the class with %j as %s %s', (options, value, unit) => {
    expect(parseMeasurement('180 lbs, top 10 in the class', options)).toMatchObject({
      value,
      unit,
      matches: [{ value, unit }],
    });
  });

  // Weight: a capital G right after a number makes a network generation, as in "5G", so "in"
  // comes after a word, not a number, and isn't inches. Only 6 ft is read, unlike
  // "ranked 3 in the state and 6 ft".
  it('rejects unrelated network prose before a height', () => {
    expect(parseMeasurement('5G in the house, 6 ft')).toBeNull();
  });

  // More Than One Measurement (PARSING.md): inches before feet aren't parts of one height, so they
  // are two measurements. AFA-250 rejects even equal readings: 72 in is 6 ft.
  it('rejects ranked 72 in the state and 6 ft', () => {
    expect(parseMeasurement('ranked 72 in the state and 6 ft')).toBeNull();
  });

  it.each([
    // More Than One Measurement (PARSING.md): 3 in and 6 ft (72 in) are two measurements that
    // disagree.
    'ranked 3 in the state and 6 ft',
    // The ticket's row: "in.the" is one word, not "in" after a number, so 10 has no unit.
    'Top 10 in.the class',
  ])('returns null for %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });
});
