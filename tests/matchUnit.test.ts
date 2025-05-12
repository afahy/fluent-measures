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
