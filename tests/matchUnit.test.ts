import { describe, it, expect } from 'vitest';
import { matchUnit } from '../src/matchUnit';

describe('matchUnit', () => {
  describe('basic unit matching', () => {
    it('matches exact height units', () => {
      expect(matchUnit('ft', 'height', 0)).toBe('ft');
      expect(matchUnit('in', 'height', 0)).toBe('in');
      expect(matchUnit('cm', 'height', 0)).toBe('cm');
      expect(matchUnit('m', 'height', 0)).toBe('m');
    });

    it('matches exact weight units', () => {
      expect(matchUnit('lb', 'weight', 0)).toBe('lb');
      expect(matchUnit('kg', 'weight', 0)).toBe('kg');
    });
  });

  describe('unit aliases', () => {
    it('matches height unit aliases', () => {
      expect(matchUnit('feet', 'height', 0)).toBe('ft');
      expect(matchUnit('foot', 'height', 0)).toBe('ft');
      expect(matchUnit("'", 'height', 0)).toBe('ft');
      expect(matchUnit('inches', 'height', 0)).toBe('in');
      expect(matchUnit('inch', 'height', 0)).toBe('in');
      expect(matchUnit('"', 'height', 0)).toBe('in');
      expect(matchUnit('centimeters', 'height', 0)).toBe('cm');
      expect(matchUnit('meters', 'height', 0)).toBe('m');
    });

    it('matches weight unit aliases', () => {
      expect(matchUnit('lbs', 'weight', 0)).toBe('lb');
      expect(matchUnit('pounds', 'weight', 0)).toBe('lb');
      expect(matchUnit('pound', 'weight', 0)).toBe('lb');
      expect(matchUnit('kilos', 'weight', 0)).toBe('kg');
      expect(matchUnit('kilogram', 'weight', 0)).toBe('kg');
      expect(matchUnit('kilograms', 'weight', 0)).toBe('kg');
    });
  });

  describe('fuzzy matching', () => {
    it.each(['food', 'feel', 'feed', 'fool'])('rejects the short prose word %s', word => {
      expect(matchUnit(word, 'height', 2)).toBeNull();
    });

    // The British spellings match only exactly (AFA-64). Each word here is one edit from one of
    // them, and more than one from any other alias, so it matches nothing.
    it.each(['mere', 'meres', 'centimetry', 'centimetros', 'metro'])(
      'rejects %s, a typo of a British spelling',
      word => {
        expect(matchUnit(word, 'height', 1)).toBeNull();
      }
    );

    it.each(['centimetre', 'centimetres', 'metre', 'metres'])('still matches %s exactly', word => {
      expect(matchUnit(word, 'height', 1)).toBe(word.startsWith('c') ? 'cm' : 'm');
    });

    it('requires the first letter even for long aliases', () => {
      expect(matchUnit('xilograms', 'weight', 2)).toBeNull();
      expect(matchUnit('xentimeters', 'height', 2)).toBeNull();
    });

    it('limits edits in proportion to alias length', () => {
      expect(matchUnit('fxxt', 'height', 2)).toBeNull();
      expect(matchUnit('kixxs', 'weight', 2)).toBeNull();
      expect(matchUnit('kilogxxms', 'weight', 1)).toBeNull();
      expect(matchUnit('kilogxxms', 'weight', 2)).toBe('kg');
    });

    it('does not fuzzy-match one- or two-letter aliases', () => {
      expect(matchUnit('fts', 'height', 2)).toBeNull();
      expect(matchUnit('kgs', 'weight', 2)).toBeNull();
    });

    it('keeps short abbreviations exact even with fuzziness enabled', () => {
      expect(matchUnit('lbs', 'weight', 2)).toBe('lb');
      expect(matchUnit('lxs', 'weight', 2)).toBeNull();
      expect(matchUnit('ls', 'weight', 2)).toBeNull();
    });

    it('matches exact aliases even when fuzziness is disabled or invalid', () => {
      expect.assertions(6);
      for (const fuzziness of [-1, 0, NaN]) {
        expect(matchUnit('feet', 'height', fuzziness)).toBe('ft');
        expect(matchUnit('fett', 'height', fuzziness)).toBeNull();
      }
    });

    it('handles small typos with fuzziness=1', () => {
      expect(matchUnit('fett', 'height', 1)).toBe('ft');
      expect(matchUnit('inche', 'height', 1)).toBe('in');
      expect(matchUnit('metter', 'height', 1)).toBe('m');
    });

    it('handles larger typos with fuzziness=2', () => {
      expect(matchUnit('feat', 'height', 2)).toBe('ft');
      expect(matchUnit('inchez', 'height', 2)).toBe('in');
      expect(matchUnit('killo', 'weight', 2)).toBe('kg');
    });

    it('does not match with insufficient fuzziness', () => {
      expect(matchUnit('feetxx', 'height', 1)).toBeNull();
      expect(matchUnit('inchxy', 'height', 1)).toBeNull();
      expect(matchUnit('kiloxx', 'weight', 1)).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('returns null for non-matching units', () => {
      expect(matchUnit('xyz', 'height', 0)).toBeNull();
      expect(matchUnit('abc', 'weight', 0)).toBeNull();
    });

    it('does not match units from wrong measurement type', () => {
      expect(matchUnit('kg', 'height', 0)).toBeNull();
      expect(matchUnit('cm', 'weight', 0)).toBeNull();
    });

    it('handles short words with fuzziness correctly', () => {
      // Should not match words shorter than 3 chars with fuzziness
      expect(matchUnit('f', 'height', 1)).toBeNull();
      expect(matchUnit('i', 'height', 1)).toBeNull();
      expect(matchUnit('k', 'weight', 1)).toBeNull();
    });

    it('handles empty strings', () => {
      expect(matchUnit('', 'height', 0)).toBeNull();
      expect(matchUnit('', 'weight', 0)).toBeNull();
      expect(matchUnit('', 'height', 1)).toBeNull();
    });
  });
});
