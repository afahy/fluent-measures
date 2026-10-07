import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions } from '../src';

// AFA-12: the allowUnqualified fallback read the number at the start of the input and dropped the
// rest. So a unit of the other type, a second number or other text gave the requested type. #24
// and #27 fixed these inputs, and these tests keep them fixed.
describe('extra text after a number', () => {
  it.each([
    // A unit of the other type means the input isn't an unqualified value.
    ['180 lbs', { type: 'height', allowUnqualified: true }],
    ['180 cm', { type: 'weight', allowUnqualified: true }],
    // "giraffes" isn't a unit.
    ['180 giraffes', { type: 'weight', allowUnqualified: true }],
    // Two numbers without units aren't one value. Without allowUnqualified, "5 11" is null too.
    ['5 11', { type: 'height', allowUnqualified: true }],
    // The tokenizer reads "1e3" as "1" and "e3", and "e3" isn't a number or a unit.
    ['1e3', { type: 'weight', allowUnqualified: true }],
    // "5.5.5" isn't a number, with a unit or without one.
    ['5.5.5 kg', {}],
    ['5.5.5', { type: 'weight', allowUnqualified: true }],
  ] as const)('returns null for %s with %o', (raw, options: ParseOptions) => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });

  // The README reads "72" as 72 in with these options. With metric inference, "180" is 180 kg, but
  // an explicit unit decides the result, so "180 lbs" stays 180 lb.
  it.each([
    ['72', { type: 'height', allowUnqualified: true, inferUnit: 'imperial' }, 72, 'in', 'height'],
    ['180', { type: 'weight', allowUnqualified: true, inferUnit: 'metric' }, 180, 'kg', 'weight'],
    [
      '180 lbs',
      { type: 'weight', allowUnqualified: true, inferUnit: 'metric' },
      180,
      'lb',
      'weight',
    ],
  ] as const)('reads %s with %o as %s %s', (raw, options: ParseOptions, value, unit, type) => {
    expect(parseMeasurement(raw, options)).toMatchObject({ value, unit, type });
  });
});
