import { describe, expect, it } from 'vitest';
import { normalizeForms, tokenize } from '../src/tokenize';

// AFA-277: quotation marks don't wrap an entry, so a curly closing quote right after a number is
// always a feet or inch mark, also before a unit name. A second mark after it stays, and the
// parser rejects it. Opening quotes stay too.
describe('curly closing quotes after a number', () => {
  it.each([
    ['“5’11””', '“5\'11"”'],
    ['„5’11””', '„5\'11"”'],
    ['”5’11””', '”5\'11"”'],
    ['“five’ ten””', '“five\' ten"”'],
    ['‘5’11’’’', "‘5'11''’"],
    ['‚5’11’’’', "‚5'11''’"],
    ['‚six’’', "‚six'’"],
    ['“72” ”', '“72" ”'],
    ['‚six’ ’', "‚six' ’"],
    ['‚72’ kg', "‚72' kg"],
    ['72’ kg', "72' kg"],
    ['5½’ ft', "5½' ft"],
    ['“72” or 70”', '“72" or 70"'],
    ['”72” or 70”', '”72" or 70"'],
  ])('writes %s as %s', (raw, expected) => {
    expect(normalizeForms(raw)).toBe(expected);
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
