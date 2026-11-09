import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseMeasurement, type MeasurementType } from '../src';
import { TABLE, oneEditSpellings } from './unitTypos';

// AFA-253: each English word that fuzzy could read as a unit is reviewed once. The maintainer
// reviews tests/fixtures/unitTypos/englishWords.json; tests/fixtures/unitTypos/README.md gives the
// word list's source and license.
const WORDS = new Set(
  readFileSync(new URL(`fixtures/unitTypos/${TABLE.wordList}`, import.meta.url), 'utf8')
    .split('\n')
    .filter(Boolean)
);
const TYPES: readonly MeasurementType[] = ['height', 'weight'];
const SPELLINGS = TYPES.flatMap(type => [...oneEditSpellings(type)]);

describe('the reviewed English words near a unit name', () => {
  it('has a word list that covers every one-edit spelling', () => {
    const outside = SPELLINGS.map(([word]) => word).filter(word => {
      const range = TABLE.filter[word[0]];
      return !range || word.length < range[0] || word.length > range[1];
    });
    expect(outside).toEqual([]);
    expect(WORDS.size).toBe(16197);
  });

  it('reviews each English word in the set, and only those', () => {
    const english = SPELLINGS.filter(([word]) => WORDS.has(word))
      .map(([word, unit]) => `${word} ${unit}`)
      .sort();
    const reviewed = TABLE.words.map(({ word, unit }) => `${word} ${unit}`).sort();
    expect(english).toEqual(reviewed);
  });

  it.each(TABLE.words.filter(({ decision }) => decision === 'allow'))(
    'reads the allowed word $word as $unit',
    ({ word, unit }) => {
      expect(parseMeasurement(`150 ${word}`, { fuzzy: true })).toMatchObject({ value: 150, unit });
      expect(parseMeasurement(`150 ${word}`)).toBeNull();
    }
  );

  it.each(TABLE.words.filter(({ decision }) => decision === 'block'))(
    'never reads the blocked word $word',
    ({ word }) => {
      expect(parseMeasurement(`150 ${word}`, { fuzzy: true })).toBeNull();
    }
  );
});
