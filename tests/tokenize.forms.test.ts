import { describe, expect, it } from 'vitest';
import { tokenize } from '../src/tokenize';
import { underStryker } from './timing';

const tokenTexts = (input: string): string[] => tokenize(input).map(({ text }) => text);

// AFA-88: these cases moved from tests/normalizeForms.test.ts. Its function, normalizeForms, was
// the first of the passes that the single scan replaced. Each input must give the tokens of the
// text that the old test expected, as main's tokenizer at f85a98d splits that text. A few inputs
// have a Unicode fraction or a comma, which the old test left for the later passes. Their tokens
// are those of the full conversion, which the fraction and comma tests expect: "5½" is 5.5, "½"
// is 0.5 and ",5" is .5, as main's tokenize at f85a98d gives them.
describe('tokenize: character forms', () => {
  it.each([
    ['5’11”', ['5', "'", '11', '"']],
    ['5′11″', ['5', '′', '11', '″']],
    ['5ʹ11ʺ', ['5', '′', '11', '″']],
    ['‘5’ 11′′', ['‘', '5', "'", '11', '″']],
    ['‘5’ 11´´', ['‘', '5', "'", '11', '″']],
    ['‘5’ 11ʹʹ', ['‘', '5', "'", '11', '″']],
    ["‘5’ 11′'", ['‘', '5', "'", '11', '″']],
    ["‘5’ 11'′", ['‘', '5', "'", '11', '″']],
    ['5´11´´', ['5', '′', '11', '″']],
    ['１８０ｃｍ', ['180', 'cm']],
    ['180 ㎝', ['180', 'cm']],
    ['70 ㎏', ['70', 'kg']],
    ['‘tall’ 5’11”', ['‘', 'tall', '’', '5', "'", '11', '"']],
    ['5’11’’', ['5', "'", '11', '″']],
    ['72” or 70”', ['72', '"', 'or', '70', '"']],
    ['“72” or 70”', ['“', '72', '"', 'or', '70', '"']],
    ['”72” or 70”', ['”', '72', '"', 'or', '70', '"']],
    ['72 ” or 70 ”', ['72', '"', 'or', '70', '"']],
    ['seventy” or eighty”', ['seventy', '"', 'or', 'eighty', '"']],
    ['six and a half ” or seven ”', ['six', 'and', 'a', 'half', '"', 'or', 'seven', '"']],
    // The full scan also reads the fraction or comma that the form step left.
    ['5½” or 6¼”', ['5.5', '"', 'or', '6.25', '"']],
    ['“5 ft 11”', ['“', '5', 'ft', '11', '"']],
    ['„5 ft 11”', ['„', '5', 'ft', '11', '"']],
    ['”5 ft 11”', ['”', '5', 'ft', '11', '"']],
    ['‚5 ft 11’', ['‚', '5', 'ft', '11', "'"]],
    ['„1 m 80”', ['„', '1', 'm', '80', '"']],
    ['”1 m 80”', ['”', '1', 'm', '80', '"']],
    ['‚1 m 80’', ['‚', '1', 'm', '80', "'"]],
    ['„72” kg', ['„', '72', '"', 'kg']],
    ['‚72’ kg', ['‚', '72', "'", 'kg']],
    ['‘5 ft 11’', ['‘', '5', 'ft', '11', "'"]],
    ['“1 m 80”', ['“', '1', 'm', '80', '"']],
    ['‘1 m 80’', ['‘', '1', 'm', '80', "'"]],
    ['“kg 72.5”', ['“', 'kg', '72.5', '"']],
    ['72’ kg', ['72', "'", 'kg']],
    // The full scan also reads the fraction or comma that the form step left.
    ['5½’ ft', ['5.5', "'", 'ft']],
    ['−5 ft', ['-', '5', 'ft']],
    ['﹣5 ft', ['-', '5', 'ft']],
    ['－5 ft', ['-', '5', 'ft']],
    // The full scan also reads the fraction or comma that the form step left.
    ['−½ lb', ['-', '0.5', 'lb']],
    ['−.5 kg', ['-', '.5', 'kg']],
    // The full scan also reads the fraction or comma that the form step left.
    ['−,5 kg', ['-', '.5', 'kg']],
    ['kg −−5', ['kg', '−', '-', '5']],
    ['kg−70.5 or −2', ['kg', '-', '70.5', 'or', '−', '2']],
    ['often −5 ft', ['often', '-', '5', 'ft']],
    ['Someone −5 ft', ['someone', '-', '5', 'ft']],
  ])('reads %s as the tokens of the converted text', (input, expected) => {
    expect(tokenTexts(input)).toEqual(expected);
  });

  // Fractions convert, and plain text doesn't change. A minus sign after a number, or one that no
  // number follows, stays.
  it.each([
    // The full scan also reads the fraction or comma that the form step left.
    ['5½ ft', ['5.5', 'ft']],
    ['150 lbs', ['150', 'lbs']],
    ['5\'11"', ['5', "'", '11', '"']],
    ['‘180 lbs’', ['‘', '180', 'lbs', '’']],
    ['“180 lbs”', ['“', '180', 'lbs', '”']],
    ['she’s', ['she', '’', 's']],
    ['the 70s’ fashion', ['the', '70', 's', '’', 'fashion']],
    ['5−11', ['5', '−', '11']],
    ['1.5−2 m', ['1.5', '−', '2', 'm']],
    ['Height − 180 cm', ['height', '−', '180', 'cm']],
    ['180− lbs', ['180', '−', 'lbs']],
    ['150 lbs−180 lbs', ['150', 'lbs', '−', '180', 'lbs']],
    ['1 m −80 cm', ['1', 'm', '−', '80', 'cm']],
    ['5 ft ﹣11 in', ['5', 'ft', '﹣', '11', 'in']],
    ['one m−80 cm', ['one', 'm', '−', '80', 'cm']],
    ['Five ft﹣11 in', ['five', 'ft', '﹣', '11', 'in']],
    // The full scan also reads the fraction or comma that the form step left.
    ['½ lb−180 lbs', ['0.5', 'lb', '−', '180', 'lbs']],
    ['one hundred−5', ['one', 'hundred', '−', '5']],
  ])('reads %s with its characters unchanged', (input, expected) => {
    expect(tokenTexts(input)).toEqual(expected);
  });

  // A mark must not make the code search back through the whole input. A search like that took
  // about 460 ms for this input. The check for an earlier digit stops at the nearest one, so it
  // stays fast for many signs. On main these tests timed normalizeForms, which was only patterns.
  // Stryker instruments the scan, which then runs 6 to 9 times slower, so the time limits skip
  // themselves there, as tests/timing.ts says for a test with a large input. The tokens of the same
  // inputs are checked there too.
  it('reads a long run of marks and many minus signs', () => {
    expect(tokenize('1’'.repeat(100_000))).toHaveLength(200_000);
    expect(tokenTexts(`${'a'.repeat(100_000)}−5`)).toEqual(['a'.repeat(100_000), '-', '5']);
    expect(tokenize('−1 '.repeat(50_000))).toHaveLength(100_000);
    expect(tokenize('−a'.repeat(100_000))).toHaveLength(200_000);
  });

  it.skipIf(underStryker)('handles a long run of marks quickly', () => {
    const start = Date.now();
    tokenize('1’'.repeat(100_000));
    expect(Date.now() - start).toBeLessThan(400);
  });

  it.skipIf(underStryker)('handles many minus signs quickly', () => {
    const start = Date.now();
    tokenize(`${'a'.repeat(100_000)}−5`);
    tokenize('−1 '.repeat(50_000));
    tokenize('−a'.repeat(100_000));
    expect(Date.now() - start).toBeLessThan(400);
  });
});
