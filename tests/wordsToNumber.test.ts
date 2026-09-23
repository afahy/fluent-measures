import { describe, it, expect } from 'vitest';
import { wordsToNumber } from '../src/wordsToNumber';

describe('wordsToNumber', () => {
  it('converts basic number words to numbers', () => {
    expect(wordsToNumber('zero')).toEqual(0);
    expect(wordsToNumber('one')).toEqual(1);
    expect(wordsToNumber('five')).toEqual(5);
    expect(wordsToNumber('ten')).toEqual(10);
    expect(wordsToNumber('fifteen')).toEqual(15);
    expect(wordsToNumber('nineteen')).toEqual(19);
  });

  it('converts tens-based number words to numbers', () => {
    expect(wordsToNumber('twenty')).toEqual(20);
    expect(wordsToNumber('thirty')).toEqual(30);
    expect(wordsToNumber('forty')).toEqual(40);
    expect(wordsToNumber('ninety')).toEqual(90);
  });

  it('converts compound number words to numbers', () => {
    expect(wordsToNumber('twenty one')).toEqual(21);
    expect(wordsToNumber('forty five')).toEqual(45);
    expect(wordsToNumber('seventy six')).toEqual(76);
    expect(wordsToNumber('ninety nine')).toEqual(99);
  });

  it('handles hundreds correctly', () => {
    expect(wordsToNumber('one hundred')).toEqual(100);
    expect(wordsToNumber('two hundred')).toEqual(200);
    expect(wordsToNumber('five hundred')).toEqual(500);
  });

  it('handles hundreds with additional units correctly', () => {
    expect(wordsToNumber('one hundred and one')).toEqual(101);
    expect(wordsToNumber('one hundred one')).toEqual(101);
    expect(wordsToNumber('two hundred fifty')).toEqual(250);
    expect(wordsToNumber('five hundred sixty seven')).toEqual(567);
  });

  it('handles thousands correctly', () => {
    expect(wordsToNumber('one thousand')).toEqual(1000);
    expect(wordsToNumber('five thousand')).toEqual(5000);
  });

  it('handles complex thousands numbers correctly', () => {
    expect(wordsToNumber('one thousand two hundred')).toEqual(1200);
    expect(wordsToNumber('one thousand two hundred and fifty')).toEqual(1250);
    expect(wordsToNumber('five thousand six hundred and seventy eight')).toEqual(5678);
    expect(wordsToNumber('twenty five thousand')).toEqual(25000);
    expect(wordsToNumber('ninety nine thousand nine hundred and ninety nine')).toEqual(99999);
  });

  it('returns null for invalid input', () => {
    expect(wordsToNumber('not a number')).toBeNull();
    expect(wordsToNumber('twenty banana')).toBeNull();
    expect(wordsToNumber('five thousands')).toBeNull();
    expect(wordsToNumber('')).toBeNull();
  });

  it('ignores "and" in the input', () => {
    expect(wordsToNumber('twenty and five')).toEqual(25);
    expect(wordsToNumber('one hundred and one')).toEqual(101);
    expect(wordsToNumber('one thousand and one')).toEqual(1001);
  });

  it('handles multiple spaces between words', () => {
    expect(wordsToNumber('twenty  one')).toEqual(21);
    expect(wordsToNumber('one   hundred   twenty')).toEqual(120);
  });
});
