import { describe, expect, it } from 'vitest';
import { normalizeForms, tokenize } from '../src/tokenize';

describe('a curly unit followed by its entry close', () => {
  it.each([
    // Keep main's ambiguous closing tokens: only the existing wrapper cursor owns them.
    ['“5’11””', "“5'11””"],
    ['„5’11””', "„5'11””"],
    ['”5’11””', "”5'11””"],
    ['“five’ ten””', "“five' ten””"],
    ['‘5’11’’’', "‘5'11''’"],
    ['‚5’11’’’', "‚5'11''’"],
    ['‚six’’', '‚six’’'],
    ['“72” ”', '“72” ”'],
    ['‚six’ ’', '‚six’ ’'],
    // A genuine quotation followed by a named unit retains the closing mark.
    ['‚72’ kg', '‚72’ kg'],
    ['72’ kg', '72’ kg'],
    ['5½’ ft', '5½’ ft'],
    ['“72” or 70”', '“72” or 70"'],
    ['”72” or 70”', '”72” or 70"'],
  ])('writes %s as %s', (raw, expected) => {
    expect(normalizeForms(raw)).toBe(expected);
  });

  it.each([
    ['‘5’11’’’', ['‘', '5', "'", '11', "'", "'", '’']],
    ['‚5’11’’’', ['‚', '5', "'", '11', "'", "'", '’']],
    ['72’’’', ['72', "'", "'", '’']],
    // ASCII triples cannot borrow a quote as the absent entry close.
    ["72'''", ['72', "'", "'", "'"]],
    ["''72''", ["'", "'", '72', "'", "'"]],
  ])('keeps the closing token in %s', (raw, expected) => {
    expect(tokenize(raw).map(token => token.text)).toEqual(expected);
  });
});
