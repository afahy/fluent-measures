import { describe, expect, it } from 'vitest';
import { parseMeasurement, type MeasurementType, type Unit } from '../src';
import { matchUnit } from '../src/matchUnit';
import { FUZZY_TYPOS as SOURCE_TYPOS } from '../src/units';
import {
  FUZZY_TYPOS,
  NUMBER_TYPOS,
  NUMBER_WORD_NAMES,
  UNIT_NAMES,
  expectedUnit,
  oneEditSpellings,
  oneEdits,
} from './unitTypos';

// AFA-253: fuzzy reads one edit, so it accepts a finite set of spellings. This test checks every
// word one edit from every unit name, against the rules in PARSING.md, "Fuzzy Matching", as
// tests/unitTypos.ts implements them without matchUnit.
const TYPES: readonly MeasurementType[] = ['height', 'weight'];

describe('every one-edit spelling of a unit name', () => {
  it('has the size that the rules give', () => {
    // Counted separately with a Python script of the same rules: 2,288 height and 1,653 weight
    // spellings (3,941 in all).
    expect(oneEditSpellings('height').size).toBe(2288);
    expect(oneEditSpellings('weight').size).toBe(1653);
  });

  it.each(TYPES)('reads each %s spelling as the documented unit, with fuzzy on and off', type => {
    const mismatches: string[] = [];
    const words = [
      ...UNIT_NAMES[type].flatMap(([, names]) => names.flatMap(name => [name, ...oneEdits(name)])),
      ...Object.keys(FUZZY_TYPOS[type]),
    ];
    for (const word of words) {
      for (const fuzzy of [true, false]) {
        const want = expectedUnit(word, type, fuzzy);
        const got = matchUnit(word, type, fuzzy);
        if (got !== want) mismatches.push(`${word} fuzzy=${fuzzy}: ${got}, not ${want}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it.each(TYPES)('reads no %s spelling as a unit of the other type', type => {
    const other: MeasurementType = type === 'height' ? 'weight' : 'height';
    const crossed = [...oneEditSpellings(type).keys()].filter(word => matchUnit(word, other, true));
    expect(crossed).toEqual([]);
  });

  // AFA-253 comment d5897102: with fuzzy, English words one edit from a unit name read as it.
  it.each([
    ['5 feat', 5, 'ft'],
    ['6 food', 6, 'ft'],
    ['5 feel', 5, 'ft'],
    ['70 kiln', 70, 'kg'],
    ['5 kills', 5, 'kg'],
    ['150 ponds', 150, 'lb'],
    // PARSING.md: wherever a unit can stand, before a number and in a compound (5 x 12 + 11 = 71).
    ['food: 180', 180, 'ft'],
    ['kill 5', 5, 'kg'],
    ['5 feel 11', 71, 'in'],
  ] as const)('reads the English word in %s with fuzzy only', (raw, value, unit) => {
    expect(parseMeasurement(raw, { fuzzy: true })).toMatchObject({ value, unit });
    expect(parseMeasurement(raw)).toBeNull();
  });
});

// The fuzzy typo list in PARSING.md, which AFA-280 fills: typos that only fuzzy reads, beyond the
// one-edit rule.
describe('the fuzzy typo list', () => {
  const entries = TYPES.flatMap(type =>
    Object.entries(FUZZY_TYPOS[type]).map(([word, unit]) => ({ type, word, unit: unit as Unit }))
  );
  const words = [...entries.map(({ word }) => word), ...Object.keys(NUMBER_TYPOS)];

  // AFA-280: an entry earns its place only when no other rule reads it already.
  it('lists only words that no other rule reads', () => {
    expect.hasAssertions();
    expect(entries.length).toBe(4);
    expect(Object.keys(NUMBER_TYPOS)).toHaveLength(2);
    for (const word of words) {
      expect(NUMBER_WORD_NAMES.has(word)).toBe(false);
      for (const type of TYPES) {
        expect(UNIT_NAMES[type].some(([, names]) => names.includes(word))).toBe(false);
        expect(oneEditSpellings(type).has(word)).toBe(false);
      }
    }
    for (const { word } of Object.values(NUMBER_TYPOS))
      expect(NUMBER_WORD_NAMES.has(word)).toBe(true);
  });

  // The list in src/units.ts holds exactly the entries that PARSING.md documents.
  it('has the documented entries in the source', () => {
    expect(Object.fromEntries(SOURCE_TYPOS)).toEqual({
      ...FUZZY_TYPOS.height,
      ...FUZZY_TYPOS.weight,
      ...Object.fromEntries(Object.entries(NUMBER_TYPOS).map(([typo, { word }]) => [typo, word])),
    });
  });

  it.each(Object.entries(NUMBER_TYPOS))(
    'reads the number-word typo %s as its number with fuzzy only, and never as a unit',
    (typo, { value }) => {
      expect.assertions(6);
      for (const type of TYPES) {
        expect(matchUnit(typo, type, true)).toBeNull();
        expect(matchUnit(typo, type)).toBeNull();
      }
      expect(parseMeasurement(`${typo} kg`, { fuzzy: true })).toMatchObject({ value, unit: 'kg' });
      expect(parseMeasurement(`${typo} kg`)).toBeNull();
    }
  );

  it.each(entries)('reads $word as $unit with fuzzy only', ({ type, word, unit }) => {
    expect(matchUnit(word, type, true)).toBe(unit);
    expect(matchUnit(word, type, false)).toBeNull();
    expect(matchUnit(word, type)).toBeNull();
    // A typo reads only as a unit of its own type.
    expect(matchUnit(word, type === 'height' ? 'weight' : 'height', true)).toBeNull();
    expect(parseMeasurement(`70 ${word}`, { fuzzy: true })).toMatchObject({ value: 70, unit });
    expect(parseMeasurement(`70 ${word}`)).toBeNull();
  });
});
