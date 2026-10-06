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
  ])('writes %s as %s', (input, output) => {
    expect(normalizeForms(input)).toBe(output);
  });

  // Fractions stay for normalizeFractions, and plain text doesn't change.
  it.each(['5½ ft', '150 lbs', '5\'11"'])('leaves %s as it is', input => {
    expect(normalizeForms(input)).toBe(input);
  });
});
