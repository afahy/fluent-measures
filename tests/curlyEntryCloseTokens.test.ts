import { describe, expect, it } from 'vitest';
import { tokenize } from '../src/tokenize';

// AFA-277: quotation marks don't wrap an entry, so a curly closing quote right after a number is
// always a feet or inch mark, also before a unit name. A second mark after it stays, and the
// parser rejects it. Opening quotes stay too.
describe('curly closing quotes after a number', () => {
  // AFA-88: each input gives the tokens of the text that normalizeForms wrote for it, as main's
  // tokenizer at f85a98d splits that text. "5½" is 5.5, as the fraction tests expect.
  it.each([
    ['“5’11””', ['“', '5', "'", '11', '"', '”']],
    ['„5’11””', ['„', '5', "'", '11', '"', '”']],
    ['”5’11””', ['”', '5', "'", '11', '"', '”']],
    ['“five’ ten””', ['“', 'five', "'", 'ten', '"', '”']],
    ['‘5’11’’’', ['‘', '5', "'", '11', "'", "'", '’']],
    ['‚5’11’’’', ['‚', '5', "'", '11', "'", "'", '’']],
    ['‚six’’', ['‚', 'six', "'", '’']],
    ['“72” ”', ['“', '72', '"', '”']],
    ['‚six’ ’', ['‚', 'six', "'", '’']],
    ['‚72’ kg', ['‚', '72', "'", 'kg']],
    ['72’ kg', ['72', "'", 'kg']],
    // The full scan also reads the fraction that the form step left.
    ['5½’ ft', ['5.5', "'", 'ft']],
    ['“72” or 70”', ['“', '72', '"', 'or', '70', '"']],
    ['”72” or 70”', ['”', '72', '"', 'or', '70', '"']],
  ])('writes %s as the tokens of its marks', (raw, expected) => {
    expect(tokenize(raw).map(token => token.text)).toEqual(expected);
  });

  it.each([
    ['‘5’11’’’', ['‘', '5', "'", '11', "'", "'", '’']],
    ['‚5’11’’’', ['‚', '5', "'", '11', "'", "'", '’']],
    ['72’’’', ['72', "'", "'", '’']],
    // A third mark keeps two marks from becoming an inch mark.
    ["72'''", ['72', "'", "'", "'"]],
    // Two marks right after a number are an inch mark.
    ['72’’', ['72', '″']],
    ["''72''", ["'", "'", '72', '″']],
  ])('splits %s into marks', (raw, expected) => {
    expect(tokenize(raw).map(token => token.text)).toEqual(expected);
  });
});
