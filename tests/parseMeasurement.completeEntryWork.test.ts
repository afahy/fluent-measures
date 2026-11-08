import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

// AFA-250: preserve these public rejection cases in source and ESM/CJS package suites.
// Private reader call/character bounds are asserted separately in numberReadingWork.test.ts.
describe('complete-entry malformed number runs', () => {
  it.each([8, 16, 32])('rejects %i repeated prefix values', count => {
    const raw = `ft ${'1 '.repeat(count)}1`;
    expect(parseMeasurement(raw)).toBeNull();
  });
  it.each([8, 16, 32])('rejects %i repeated bare-pair conjunctions', count => {
    const raw = `5 ft ${'1 and '.repeat(count)}1 pounds`;
    expect(parseMeasurement(raw, { type: 'height' })).toBeNull();
  });
  it.each([8, 16, 32])('rejects %i repeated values before a decimal', count => {
    expect.hasAssertions();
    for (const raw of [
      `ft ${'1 '.repeat(count)}eleven point five`,
      `5 ft ${'1 and '.repeat(count)}one point five pounds`,
    ]) {
      expect(parseMeasurement(raw, { type: 'height' })).toBeNull();
    }
  });
});
