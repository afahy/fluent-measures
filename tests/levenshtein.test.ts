import { describe, it, expect } from 'vitest';
import { levenshtein } from '../src/levenshtein';

describe('levenshtein', () => {
  describe('identical strings', () => {
    it('returns 0 for empty strings', () => {
      expect(levenshtein('', '')).toBe(0);
    });

    it('returns 0 for identical strings', () => {
      expect(levenshtein('hello', 'hello')).toBe(0);
      expect(levenshtein('test', 'test')).toBe(0);
      expect(levenshtein('12345', '12345')).toBe(0);
    });
  });

  describe('single character differences', () => {
    it('handles single character insertions', () => {
      expect(levenshtein('cat', 'cats')).toBe(1);
      expect(levenshtein('dog', 'dogs')).toBe(1);
      expect(levenshtein('', 'a')).toBe(1);
    });

    it('handles single character deletions', () => {
      expect(levenshtein('cats', 'cat')).toBe(1);
      expect(levenshtein('dogs', 'dog')).toBe(1);
      expect(levenshtein('a', '')).toBe(1);
    });

    it('handles single character substitutions', () => {
      expect(levenshtein('cat', 'cut')).toBe(1);
      expect(levenshtein('dog', 'dig')).toBe(1);
      expect(levenshtein('a', 'b')).toBe(1);
    });
  });

  describe('multiple character differences', () => {
    it('handles multiple character insertions', () => {
      expect(levenshtein('cat', 'catch')).toBe(2);
      expect(levenshtein('dog', 'doing')).toBe(2);
      expect(levenshtein('', 'ab')).toBe(2);
    });

    it('handles multiple character deletions', () => {
      expect(levenshtein('catch', 'cat')).toBe(2);
      expect(levenshtein('doing', 'dog')).toBe(2);
      expect(levenshtein('ab', '')).toBe(2);
    });

    it('handles multiple character substitutions', () => {
      expect(levenshtein('book', 'cook')).toBe(1);
      expect(levenshtein('test', 'tent')).toBe(1);
      expect(levenshtein('hello', 'hallo')).toBe(1);
    });

    it('handles mixed operations', () => {
      expect(levenshtein('kitten', 'sitting')).toBe(3);
      expect(levenshtein('saturday', 'sunday')).toBe(3);
      expect(levenshtein('feet', 'feetxx')).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('handles completely different strings', () => {
      expect(levenshtein('abc', 'xyz')).toBe(3);
      expect(levenshtein('hello', 'world')).toBe(4);
    });

    it('handles strings of very different lengths', () => {
      expect(levenshtein('a', 'abcdef')).toBe(5);
      expect(levenshtein('abcdef', 'a')).toBe(5);
    });

    it('handles case sensitivity', () => {
      expect(levenshtein('hello', 'Hello')).toBe(1);
      expect(levenshtein('WORLD', 'world')).toBe(5);
    });
  });
});
