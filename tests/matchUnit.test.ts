import { describe, it, expect } from 'vitest';
import { matchUnit } from '../src/matchUnit';

describe('matchUnit', () => {
  describe('basic unit matching', () => {
    it('matches exact height units', () => {
      expect(matchUnit('ft', 'height', false)).toBe('ft');
      expect(matchUnit('in', 'height', false)).toBe('in');
      expect(matchUnit('cm', 'height', false)).toBe('cm');
      expect(matchUnit('m', 'height', false)).toBe('m');
    });

    it('matches exact weight units', () => {
      expect(matchUnit('lb', 'weight', false)).toBe('lb');
      expect(matchUnit('kg', 'weight', false)).toBe('kg');
    });
  });

  describe('unit aliases', () => {
    it('matches height unit aliases', () => {
      expect(matchUnit('feet', 'height', false)).toBe('ft');
      expect(matchUnit('foot', 'height', false)).toBe('ft');
      expect(matchUnit("'", 'height', false)).toBe('ft');
      expect(matchUnit('inches', 'height', false)).toBe('in');
      expect(matchUnit('inch', 'height', false)).toBe('in');
      expect(matchUnit('"', 'height', false)).toBe('in');
      expect(matchUnit('centimeters', 'height', false)).toBe('cm');
      expect(matchUnit('meters', 'height', false)).toBe('m');
    });

    it('matches weight unit aliases', () => {
      expect(matchUnit('lbs', 'weight', false)).toBe('lb');
      expect(matchUnit('pounds', 'weight', false)).toBe('lb');
      expect(matchUnit('pound', 'weight', false)).toBe('lb');
      expect(matchUnit('kilos', 'weight', false)).toBe('kg');
      expect(matchUnit('kilogram', 'weight', false)).toBe('kg');
      expect(matchUnit('kilograms', 'weight', false)).toBe('kg');
    });
  });

  describe('fuzzy matching', () => {
    // AFA-253 comment d5897102: there is no blocked list, so with fuzzy these English words, one
    // edit from "foot" or "feet", read as feet. Main blocked them at any fuzziness.
    it.each(['food', 'feel', 'feed', 'fool'])(
      'reads the English word %s as feet with fuzzy',
      word => {
        expect(matchUnit(word, 'height', true)).toBe('ft');
        expect(matchUnit(word, 'height', false)).toBeNull();
      }
    );

    // The British spellings match only exactly (AFA-64). Each word here is one edit from one of
    // them, and more than one from any other alias, so it matches nothing.
    it.each(['mere', 'meres', 'centimetry', 'centimetros', 'metro'])(
      'rejects %s, a typo of a British spelling',
      word => {
        expect(matchUnit(word, 'height', true)).toBeNull();
      }
    );

    it.each(['centimetre', 'centimetres', 'metre', 'metres'])('still matches %s exactly', word => {
      expect(matchUnit(word, 'height', true)).toBe(word.startsWith('c') ? 'cm' : 'm');
    });

    it('requires the first letter even for long aliases', () => {
      expect(matchUnit('xilograms', 'weight', true)).toBeNull();
      expect(matchUnit('xentimeters', 'height', true)).toBeNull();
    });

    // AFA-253: fuzzy reads one edit only, so two edits match nothing, even in a long alias.
    it('reads no word two edits from a unit name', () => {
      expect(matchUnit('fxxt', 'height', true)).toBeNull();
      expect(matchUnit('kixxs', 'weight', true)).toBeNull();
      expect(matchUnit('kilogxxms', 'weight', true)).toBeNull();
    });

    it('does not fuzzy-match one- or two-letter aliases', () => {
      expect(matchUnit('fts', 'height', true)).toBeNull();
      expect(matchUnit('kgg', 'weight', true)).toBeNull();
    });

    it('keeps short abbreviations exact even with fuzzy on', () => {
      expect(matchUnit('lbs', 'weight', true)).toBe('lb');
      expect(matchUnit('kgs', 'weight', true)).toBe('kg');
      expect(matchUnit('cms', 'height', true)).toBe('cm');
      expect(matchUnit('lxs', 'weight', true)).toBeNull();
      expect(matchUnit('ls', 'weight', true)).toBeNull();
    });

    it('matches exact aliases with fuzzy off', () => {
      expect.assertions(4);
      for (const fuzzy of [false, undefined]) {
        expect(matchUnit('feet', 'height', fuzzy)).toBe('ft');
        expect(matchUnit('fett', 'height', fuzzy)).toBeNull();
      }
    });

    // "fett" is one edit from "feet". "kilgrm" is two edits from "kilogram", but it is on the reviewed fuzzy typo list
    // (PARSING.md), so fuzzy reads it, as main's fuzziness 2 did. "kilgrom" is two edits too, and
    // isn't on the list.
    it('reads one edit, and two only for a listed typo', () => {
      expect(matchUnit('fett', 'height', true)).toBe('ft');
      expect(matchUnit('kilgrm', 'weight', true)).toBe('kg');
      expect(matchUnit('kilgrom', 'weight', true)).toBeNull();
    });

    it('handles small typos', () => {
      expect(matchUnit('fett', 'height', true)).toBe('ft');
      expect(matchUnit('inche', 'height', true)).toBe('in');
      expect(matchUnit('metter', 'height', true)).toBe('m');
    });

    // "inchez" is one edit from "inches", "killo" one from "kilo", and the English word "feat" one
    // from "feet".
    it('reads one-edit typos, English words included', () => {
      expect(matchUnit('feat', 'height', true)).toBe('ft');
      expect(matchUnit('inchez', 'height', true)).toBe('in');
      expect(matchUnit('killo', 'weight', true)).toBe('kg');
    });

    it('does not match a word two edits away', () => {
      expect(matchUnit('feetxx', 'height', true)).toBeNull();
      expect(matchUnit('inchxy', 'height', true)).toBeNull();
      expect(matchUnit('kiloxx', 'weight', true)).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('returns null for non-matching units', () => {
      expect(matchUnit('xyz', 'height', false)).toBeNull();
      expect(matchUnit('abc', 'weight', false)).toBeNull();
    });

    it('does not match units from wrong measurement type', () => {
      expect(matchUnit('kg', 'height', false)).toBeNull();
      expect(matchUnit('cm', 'weight', false)).toBeNull();
    });

    it('handles short words with fuzzy on', () => {
      expect(matchUnit('f', 'height', true)).toBeNull();
      expect(matchUnit('i', 'height', true)).toBeNull();
      expect(matchUnit('k', 'weight', true)).toBeNull();
    });

    it('handles empty strings', () => {
      expect(matchUnit('', 'height', false)).toBeNull();
      expect(matchUnit('', 'weight', false)).toBeNull();
      expect(matchUnit('', 'height', true)).toBeNull();
    });
  });
});
