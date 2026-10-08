import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

// AFA-93: a feet or inch mark right after "half" or a number word is a mark, as it is after
// digits. The tokenizer kept `half"` and `ten"` as one token, so the word wasn't read.
describe('a mark right after a word', () => {
  it.each([
    // The ticket's rows: 5 × 12 + 10.5 = 70.5, as for `5' 10 and a half in`.
    [`5' 10 and a half"`, 70.5, 'in'],
    [`5'10 and a half"`, 70.5, 'in'],
    [`5 ft 10 and a half"`, 70.5, 'in'],
    [`six and a half'`, 6.5, 'ft'],
    // A prime becomes `"` before the tokenizer runs, so it reads the same.
    [`5′ 10 and a half″`, 70.5, 'in'],
    // Number words: 5 × 12 + 10 = 70, 6 × 12 + 2 = 74, and 70 + 0.5 = 70.5.
    [`5' ten"`, 70, 'in'],
    [`five' ten"`, 70, 'in'],
    [`5 foot ten"`, 70, 'in'],
    [`six foot two"`, 74, 'in'],
    [`5' ten and a half"`, 70.5, 'in'],
    [`six'`, 6, 'ft'],
    [`ten"`, 10, 'in'],
    [`twenty-five"`, 25, 'in'],
  ] as const)('reads %s as %s %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit });
  });

  // "Must not change" in AFA-93.
  it.each([
    [`5' 10.5"`, 70.5, 'in'],
    [`5' 10 1/2"`, 70.5, 'in'],
    [`5' 10 and a half in`, 70.5, 'in'],
    // An apostrophe in a word that only ends in a number word isn't a mark, and nor is one
    // before a letter.
    [`tone' 5 ft`, 5, 'ft'],
    [`don't 5 ft`, 5, 'ft'],
    [`one's 180 lbs`, 180, 'lb'],
    // "and a half" with no number before it isn't a number, so the mark stays with 5.
    [`size and a half' 5"`, 5, 'in'],
  ] as const)('keeps reading %s as %s %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit });
  });

  // A quoted number word isn't a measurement, and its closing quote isn't the unit of the next
  // number. "half" alone isn't a number.
  it.each([`model "one" 180`, `"ten" 5`, `'one' 5`, `half' 5`, `the other half' 5`, `half" 5`])(
    'returns null for %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );
});
