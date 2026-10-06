import { describe, expect, it } from 'vitest';
import { normalizeForms } from '../src/tokenize';

describe('normalizeForms', () => {
  it.each([
    ['5’11”', '5\'11"'],
    ['5′11″', '5\'11"'],
    ['5´11´´', "5'11''"],
    ['１８０ｃｍ', '180cm'],
    ['180 ㎝', '180 cm'],
    ['70 ㎏', '70 kg'],
    // A quotation closes before the height, so the marks after it are feet and inches.
    ['‘tall’ 5’11”', '‘tall’ 5\'11"'],
  ])('writes %s as %s', (input, output) => {
    expect(normalizeForms(input)).toBe(output);
  });

  // Fractions stay for normalizeFractions, and plain text doesn't change.
  it.each(['5½ ft', '150 lbs', '5\'11"', '‘180 lbs’', '“180 lbs”', 'she’s', 'the 70s’ fashion'])(
    'leaves %s as it is',
    input => {
      expect(normalizeForms(input)).toBe(input);
    }
  );

  // Each closing quote must not search back through the input. A backward search took about
  // 460 ms for this input, and one pass takes about 2 ms.
  it('handles a long run of marks quickly', () => {
    const start = Date.now();
    normalizeForms('1’'.repeat(100_000));
    expect(Date.now() - start).toBeLessThan(250);
  });
});
