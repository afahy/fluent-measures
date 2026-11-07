import { describe, expect, it } from 'vitest';
import { readNumberTokens, wordsToNumber } from '../src/wordsToNumber';

// Private numeric-token coordinates include conjunctions. A null complete value is never
// replaced by the numeric prefix, even when the grammar uses its boundary for one compound.
describe('shared complete number reading', () => {
  it.each([
    [['five', 'and', 'eleven'], 2],
    [['one', 'hundred', 'and', 'five', 'eleven'], 4],
    [['one', 'hundred', 'and', 'two', 'hundred'], 4],
    [['one', 'thousand', 'and', 'two', 'thousand'], 4],
    [['5', '11'], 1],
    [['five', 'and', 'eleven', 'point', 'five'], 2],
    [['one', 'hundred', 'and', 'five', 'eleven', 'point', 'five'], 4],
    [['one', 'and', 'two', 'point', 'five'], 2],
    [['one', 'point', 'oh', 'five'], 2],
    [['one', 'point', 'five', 'oh'], 3],
    [['one', 'point', 'five', 'point', 'two'], 3],
    [['one', 'point', 'and', 'five'], 2],
    [['one', 'point', 'five', 'and', 'two'], 3],
    [['one', 'point', '2.5'], 2],
    [['1.5', 'point', 'two'], 1],
    [['one', 'point'], 2],
    [['one', 'point', 'and'], 2],
  ] as const)('keeps the supplied-token failure coordinate in %j', (tokens, invalidAt) => {
    expect(readNumberTokens(tokens)).toEqual({ value: null, invalidAt });
    expect(wordsToNumber(tokens.join(' '))).toBeNull();
  });
  it.each([
    [['one', 'hundred', 'and', 'five'], 105],
    [['one', 'hundred', 'and', 'fifty'], 150],
    [['ten', 'and', 'one'], 11],
    [['zero'], 0],
    [['one', 'hundred', 'and', 'fifty', 'point', 'two', 'five'], 150.25],
    [['point', 'zero', 'zero', 'five'], 0.005],
    [['point', '005'], 0.005],
    [['zero', 'point', 'zero'], 0],
    [['one', 'point', 'five', 'and', 'and'], 1.5],
  ] as const)('returns only the complete value for %j', (tokens, value) => {
    expect(readNumberTokens(tokens)).toEqual({ value, invalidAt: tokens.length });
    expect(wordsToNumber(tokens.join(' '))).toBe(value);
  });
  it('keeps decimal adapter casing and trailing-space compatibility', () => {
    expect(wordsToNumber('ONE POINT FIVE')).toBe(1.5);
    expect(wordsToNumber('one point five ')).toBe(1.5);
    expect(wordsToNumber('one point five and ')).toBeNull();
  });
});
