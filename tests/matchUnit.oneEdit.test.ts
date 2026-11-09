import { describe, expect, it } from 'vitest';
import type { MeasurementType } from '../src';
import { matchUnit } from '../src/matchUnit';
import { BLOCKED, UNIT_NAMES, expectedUnit, oneEditSpellings, oneEdits } from './unitTypos';

// AFA-253: fuzzy reads one edit, so it accepts a finite set of spellings. This test checks every
// word one edit from every unit name, against the rules in PARSING.md, "Fuzzy Matching", as
// tests/unitTypos.ts implements them without matchUnit.
const TYPES: readonly MeasurementType[] = ['height', 'weight'];

describe('every one-edit spelling of a unit name', () => {
  it('has the size that the rules give', () => {
    // Counted separately with a Python script of the same rules: 2,288 height and 1,653 weight spellings (3,941 in all),
    // before the reviewed table blocks 29 English words.
    expect(oneEditSpellings('height').size).toBe(2288);
    expect(oneEditSpellings('weight').size).toBe(1653);
    expect(BLOCKED.size).toBe(29);
  });

  it.each(TYPES)('reads each %s spelling as the documented unit, with fuzzy on and off', type => {
    const mismatches: string[] = [];
    for (const [, names] of UNIT_NAMES[type]) {
      for (const name of names) {
        for (const word of [name, ...oneEdits(name)]) {
          for (const fuzzy of [true, false]) {
            const want = expectedUnit(word, type, fuzzy);
            const got = matchUnit(word, type, fuzzy);
            if (got !== want) mismatches.push(`${word} fuzzy=${fuzzy}: ${got}, not ${want}`);
          }
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it.each(TYPES)('reads no %s spelling as a unit of the other type', type => {
    const other: MeasurementType = type === 'height' ? 'weight' : 'height';
    const crossed = [...oneEditSpellings(type).keys()].filter(word => matchUnit(word, other, true));
    expect(crossed).toEqual([]);
  });
});
