import { describe, expect, it, vi } from 'vitest';
import { parseMeasurement } from '../src';
import * as numbers from '../src/wordsToNumber';

// AFA-250: same parsed-character bound as numberWords.test.ts; small public inputs only.
// The two complete malformed phrases cannot be salvaged into either component or pair.
describe('complete-entry number work', () => {
  it.each([8, 16, 32])('bounds prefix-compound work for %i repeated values', count => {
    const raw = `ft ${'1 '.repeat(count)}1`;
    const parser = vi.spyOn(numbers, 'readNumberTokens');
    try {
      expect(parseMeasurement(raw)).toBeNull();
      expect(parser.mock.calls.length).toBeGreaterThan(0);
      const chars = parser.mock.calls.reduce((sum, [phrase]) => sum + phrase.join(' ').length, 0);
      expect(chars).toBeLessThan(raw.length * 4);
    } finally {
      parser.mockRestore();
    }
  });
  it.each([8, 16, 32])('bounds bare-pair work for %i repeated conjunctions', count => {
    const raw = `5 ft ${'1 and '.repeat(count)}1 pounds`;
    const parser = vi.spyOn(numbers, 'readNumberTokens');
    try {
      expect(parseMeasurement(raw, { type: 'height' })).toBeNull();
      expect(parser.mock.calls.length).toBeGreaterThan(0);
      const chars = parser.mock.calls.reduce((sum, [phrase]) => sum + phrase.join(' ').length, 0);
      expect(chars).toBeLessThan(raw.length * 4);
    } finally {
      parser.mockRestore();
    }
  });
  it.each([8, 16, 32])('bounds decimal split work for %i repeated values', count => {
    expect.hasAssertions();
    const parser = vi.spyOn(numbers, 'readNumberTokens');
    try {
      for (const raw of [
        `ft ${'1 '.repeat(count)}eleven point five`,
        `5 ft ${'1 and '.repeat(count)}one point five pounds`,
      ]) {
        parser.mockClear();
        expect(parseMeasurement(raw, { type: 'height' })).toBeNull();
        expect(parser.mock.calls.length).toBeGreaterThan(0);
        const chars = parser.mock.calls.reduce((sum, [phrase]) => sum + phrase.join(' ').length, 0);
        expect(chars).toBeLessThan(raw.length * 4);
      }
    } finally {
      parser.mockRestore();
    }
  });
});
