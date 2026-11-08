import { describe, expect, it } from 'vitest';
import { normalizeForms, tokenize } from '../src/tokenize';

// AFA-277: quotation marks don't wrap an entry, so every curly closing quote is a feet or inch
// mark. "’" becomes "'" and "”" becomes '"'. Opening quotes stay, and the parser rejects them.
describe('curly closing quotes', () => {
  it.each([
    ['“5’11””', '“5\'11""'],
    ['„5’11””', '„5\'11""'],
    ['”5’11””', '"5\'11""'],
    ['“five’ ten””', '“five\' ten""'],
    ['‘5’11’’’', "‘5'11'''"],
    ['‚5’11’’’', "‚5'11'''"],
    ['‚six’’', "‚six''"],
    ['“72” ”', '“72" "'],
    ['‚six’ ’', "‚six' '"],
    ['‚72’ kg', "‚72' kg"],
    ['72’ kg', "72' kg"],
    ['5½’ ft', "5½' ft"],
    ['“72” or 70”', '“72" or 70"'],
    ['”72” or 70”', '"72" or 70"'],
  ])('writes %s as %s', (raw, expected) => {
    expect(normalizeForms(raw)).toBe(expected);
  });

  it.each([
    ['‘5’11’’’', ['‘', '5', "'", '11', "'", "'", "'"]],
    ['‚5’11’’’', ['‚', '5', "'", '11', "'", "'", "'"]],
    ['72’’’', ['72', "'", "'", "'"]],
    // Only two marks right after a number are an inch mark. Three stay separate.
    ["72'''", ['72', "'", "'", "'"]],
    ['72’’', ['72', '"']],
    ["''72''", ["'", "'", '72', '"']],
  ])('splits %s into marks', (raw, expected) => {
    expect(tokenize(raw).map(token => token.text)).toEqual(expected);
  });
});
