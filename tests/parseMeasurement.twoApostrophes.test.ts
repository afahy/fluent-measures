// AFA-250: recovery expectations now follow the approved complete-entry contract in PARSING.md.
// Earlier ticket rationales below describe their historical extraction contract; original
// assertions are retained separately under design/afa-250.
import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

// AFA-106: two apostrophes stand in for the inch mark (corpus: symbols-two-apostrophes), so
// after a number they read as `"`.
describe('two apostrophes as an inch mark', () => {
  it.each([
    // The ticket's rows. Each gives what the same input with `"` gives.
    [`72''`, 72, 'in'],
    ['72´´', 72, 'in'],
    ['72’’', 72, 'in'],
    [`5'' tall`, 5, 'in'],
    [`height 72''`, 72, 'in'],
  ] as const)('reads %s as %s %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit });
  });

  it('rejects a second equal compound after two apostrophes', () => {
    // AFA-250: each compound is 5 × 12 + 11 = 71, but there are two independent heights.
    expect(parseMeasurement('5´11´´-5 ft 11 in')).toBeNull();
  });

  // Two heights that disagree give null, as `180 cm, 72"` does.
  it(`returns null for 180 cm, 72''`, () => {
    expect(parseMeasurement(`180 cm, 72''`)).toBeNull();
  });

  // "Must not change" in AFA-106.
  it.each(["it''s 5 ft"])('rejects the complete entry %s (AFA-250)', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });
  it.each([
    [`5'11''`, 71, 'in'],
    ['5’11’’', 71, 'in'],
    ['5´11´´', 71, 'in'],
    [`5 ft 11''`, 71, 'in'],
  ] as const)('keeps reading %s as %s %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit });
  });

  // Ranges that repeat their unit stay null. Two apostrophes that don't come right after a digit
  // return null too ("must not change"), after a space or a number word.
  it.each([`72''-74''`, `5'11''-6'1''`, `72 ''`, `five''`])('returns null for %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  // Two apostrophes that close a number they opened are quotes, and three or four marks after a
  // number aren't an inch mark. Each returns null, in every form that normalizeForms writes as
  // apostrophes.
  it.each([
    `weight ''180'' lbs`,
    `the ''5'' kg bag`,
    '´´5´´ kg',
    '’’5’’ kg',
    `''5''`,
    `72'''`,
    `72''''`,
    '72’’’',
    '72’’’’',
    '72´´´',
    '5’’’ tall',
  ])('keeps returning null for %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });
});
