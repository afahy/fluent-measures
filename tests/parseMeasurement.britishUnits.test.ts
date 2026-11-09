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

// AFA-253: "kilogramme" and "kilogrammes" are the British spellings of "kilogram" and "kilograms".
// Like the other British spellings (PARSING.md, "Fuzzy Matching"), they match only exactly.
describe('British spellings of kilograms', () => {
  it.each([
    ['95 kilogramme', {}],
    ['95 kilogrammes', {}],
    ['95 KILOGRAMMES', {}],
    ['kilogrammes 95', {}],
    ['weight: 95 kilogrammes', {}],
    ['95 kilogrammes', { fuzzy: true }],
    ['95 kilogrammes', { defaultUnit: 'lb' }],
  ] as const)('reads %s with %o as 95 kg', (raw, options: ParseOptions) => {
    expect(parseMeasurement(raw, options)).toMatchObject({
      value: 95,
      unit: 'kg',
      type: 'weight',
      matches: [{ value: 95, unit: 'kg' }],
    });
  });

  // 70.50 = 70.5. Hand calculation: 95 / 0.45359237 = 209.43914907563368 lb.
  it('reads 70.50 kilogrammes as 70.5 kg', () => {
    expect(parseMeasurement('70.50 kilogrammes')).toMatchObject({ value: 70.5, unit: 'kg' });
  });
  it('converts 95 kilogrammes to pounds', () => {
    expect(parseMeasurement('95 kilogrammes', { normalizedUnit: 'lb' })?.value).toBeCloseTo(
      209.43914907563368,
      9
    );
  });

  // Exact only: "kilogrammez" and "kilogrammea" are one edit from a British alias, but three edits
  // from "kilograms", so even fuzzy reads no unit.
  it.each(['95 kilogrammez', '95 kilogrammea'])('returns null for %s with fuzzy', raw => {
    expect(parseMeasurement(raw, { fuzzy: true })).toBeNull();
  });
});
