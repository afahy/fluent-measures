import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions } from '../src';

// AFA-12: the allowUnqualified fallback read the number at the start of the input and dropped the
// rest. So a unit of the other type, a second number or other text gave the requested type. #24
// and #27 fixed these inputs, and these tests keep them fixed.
describe('the allowUnqualified fallback', () => {
  it.each([
    // "lbs" is a weight unit, so the input isn't an unqualified height.
    ['180 lbs', { type: 'height', allowUnqualified: true }],
    // "giraffes" isn't a unit.
    ['180 giraffes', { type: 'weight', allowUnqualified: true }],
    // Two numbers without units aren't one value. Without allowUnqualified, "5 11" is null too.
    ['5 11', { type: 'height', allowUnqualified: true }],
    // The tokenizer splits "1e3" into "1 e 3", so it isn't one number.
    ['1e3', { type: 'weight', allowUnqualified: true }],
    // "5.5.5" isn't a number.
    ['5.5.5 kg', {}],
  ] as const)('returns null for %s with %o', (raw, options: ParseOptions) => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });

  // The README reads "72" as 72 in with these options, and an explicit unit decides the result.
  it.each([
    ['72', { type: 'height', allowUnqualified: true, inferUnit: 'imperial' }, 72, 'in'],
    ['180 lbs', { type: 'weight', allowUnqualified: true }, 180, 'lb'],
  ] as const)('reads %s with %o as %s %s', (raw, options: ParseOptions, value, unit) => {
    expect(parseMeasurement(raw, options)).toMatchObject({ value, unit });
  });
});
