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
    // Every mark in the input converts, not only the first.
    ['5’11’’', "5'11''"],
    ['72” or 70”', '72" or 70"'],
    // A minus sign right before a number is a hyphen-minus, in each place that it occurs.
    ['−5 ft', '-5 ft'],
    ['﹣5 ft', '-5 ft'],
    ['－5 ft', '-5 ft'],
    ['−½ lb', '-½ lb'],
    ['−.5 kg', '-.5 kg'],
    ['kg−70.5 or −2', 'kg-70.5 or -2'],
  ])('writes %s as %s', (input, output) => {
    expect(normalizeForms(input)).toBe(output);
  });

  // Fractions stay for normalizeFractions, and plain text doesn't change.
  // A minus sign after a digit, or one that no number follows, is a dash.
  it.each([
    '5½ ft',
    '150 lbs',
    '5\'11"',
    '‘180 lbs’',
    '“180 lbs”',
    'she’s',
    'the 70s’ fashion',
    '5−11',
    '1.5−2 m',
    'Height − 180 cm',
    '180− lbs',
  ])('leaves %s as it is', input => {
    expect(normalizeForms(input)).toBe(input);
  });

  // A mark must not make the code search back through the whole input. A search like that
  // took about 460 ms for this input, and the current code takes a few milliseconds.
  it('handles a long run of marks quickly', () => {
    const start = Date.now();
    normalizeForms('1’'.repeat(100_000));
    expect(Date.now() - start).toBeLessThan(400);
  });
});
