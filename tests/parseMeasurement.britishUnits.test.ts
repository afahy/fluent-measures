import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions } from '../src';

// AFA-64: "centimetres" and "metres" are the British spellings of "centimeters" and "meters", and
// "#" right after a number is a common US way to write pounds.
describe('British spellings and "#" for pounds', () => {
  it.each([
    // The inputs from AFA-64.
    ['170 centimetres', 170, 'cm'],
    ['1.8 metres', 1.8, 'm'],
    ['185#', 185, 'lb'],
    // The singular forms, and parts of one height: 100 + 80 = 180 cm.
    ['5 centimetre', 5, 'cm'],
    ['1 metre 80 centimetres', 180, 'cm'],
  ] as const)('reads %s as %s %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit });
  });

  // "Must not change" in AFA-64. "#" before a number isn't a unit, and the README's spellings keep
  // working. The British spellings match only exactly, so prose such as "metro" and "mere" isn't
  // read as meters with fuzzy matching, as on main.
  it.each([
    ['Order #5, 180 lbs', {}, 180, 'lb'],
    ['180 cm', {}, 180, 'cm'],
    ['1.8 meters', {}, 1.8, 'm'],
    ['took the metro 5 stops, 180 lbs', { fuzziness: 1 }, 180, 'lb'],
    ['a mere 5 stops, 180 lbs', { fuzziness: 1 }, 180, 'lb'],
    // "#" before a number isn't a unit, so "12#3" isn't pounds, and "185#kg" has its own unit.
    ['part 12#3, 180 lbs', {}, 180, 'lb'],
    ['185#kg', {}, 185, 'kg'],
  ] as const)('keeps reading %s with %o as %s %s', (raw, options: ParseOptions, value, unit) => {
    expect(parseMeasurement(raw, options)).toMatchObject({ value, unit });
  });

  // "#" before a number isn't a unit, and neither is "#" before a letter, as in "185#é", or before
  // another "#", as on main.
  it.each(['room #12', '185#é', '185##'])('returns null for %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });
});
