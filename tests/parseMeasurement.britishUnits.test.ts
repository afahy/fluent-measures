// AFA-250: recovery expectations now follow the approved complete-entry contract in PARSING.md.
// Earlier ticket rationales below describe their historical extraction contract; original
// assertions are retained separately under design/afa-250.
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
    'Order #5, 180 lbs',
    'took the metro 5 stops, 180 lbs',
    'a mere 5 stops, 180 lbs',
    'part 12#3, 180 lbs',
    '185#kg',
  ])('rejects the complete entry %s (AFA-250 policy revision)', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });
  it.each([
    ['180 cm', {}, 180, 'cm'],
    ['1.8 meters', {}, 1.8, 'm'],
  ] as const)('keeps reading %s with %o as %s %s', (raw, options: ParseOptions, value, unit) => {
    expect(parseMeasurement(raw, options)).toMatchObject({ value, unit });
  });

  // "#" before a number isn't a unit, and neither is "#" before a letter, as in "185#é", or before
  // another "#" or "_", as on main.
  it.each(['room #12', '185#é', '185##', '185#_'])('returns null for %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });
});
