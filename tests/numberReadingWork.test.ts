import { describe, expect, it, vi } from 'vitest';
import { parseMeasurement } from '../src';
import * as numbers from '../src/wordsToNumber';

// AFA-250: source-only instrumentation; built packages do not call this private source module.
// The public counterparts remain in completeEntryWork/Prefix for both ESM and CJS.
// Same parsed-character bound as numberWords.test.ts; small public inputs only.
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

describe('complete prefix-pair reader work', () => {
  it.each([8, 16, 32])('bounds prefix-pair work for %i conjunctions', count => {
    expect.hasAssertions();
    const reader = vi.spyOn(numbers, 'readNumberTokens');
    try {
      for (const prefix of ['kg 1 and ', 'cm: 1 and ']) {
        reader.mockClear();
        const raw = prefix + '1 and '.repeat(count) + '1 pounds';
        expect(parseMeasurement(raw, { type: 'weight' })).toBeNull();
        expect(reader.mock.calls.length).toBeGreaterThan(0);
        const chars = reader.mock.calls.reduce((sum, [tokens]) => sum + tokens.join(' ').length, 0);
        expect(chars).toBeLessThan(raw.length * 4);
      }
    } finally {
      reader.mockRestore();
    }
  });
});

// A complete valid prefix needs one shared numeric decision. The bounded retry is for an
// invalid phrase with a possible compound/pair boundary, not the same successful phrase.
describe('complete prefix scalar reader work', () => {
  it.each([
    ['kg seventy two', 72, 'kg', 'weight'],
    ['kg 72.5.', 72.5, 'kg', 'weight'],
    ['kg: ½.', 0.5, 'kg', 'weight'],
    ['m: one point eight', 1.8, 'm', 'height'],
    ['ft five', 5, 'ft', 'height'],
    ['m: one and eighty', 180, 'm', 'height'],
    ['m: one hundred and eighty', 180, 'm', 'height'],
    ['ft twenty and one', 21, 'ft', 'height'],
    ['pounds six and a half', 6.5, 'lb', 'weight'],
    ['pounds two and a half thousand', 2500, 'lb', 'weight'],
  ] as const)('does not reread the successful complete phrase in %s', (raw, value, unit, type) => {
    const reader = vi.spyOn(numbers, 'readNumberTokens');
    try {
      expect(parseMeasurement(raw)).toEqual({
        value,
        unit,
        type,
        raw,
        matches: [{ value, unit }],
      });
      expect(reader.mock.calls.length).toBeGreaterThan(0);
      // Empty end-boundary attempts are allowed; every nonempty phrase is actual numeric work.
      expect(reader.mock.calls.filter(([tokens]) => tokens.length > 0)).toHaveLength(1);
    } finally {
      reader.mockRestore();
    }
  });
});

describe('explicit prefix-compound reader work', () => {
  it.each([
    'm: "one and eighty" cm',
    "m: 'one and eighty' cm",
    'ft "twenty and one" in',
    "ft 'twenty and one' in",
  ])('stops numeric work after the quoted left phrase fails in %s', raw => {
    const reader = vi.spyOn(numbers, 'readNumberTokens');
    try {
      expect(parseMeasurement(raw)).toBeNull();
      expect(reader.mock.calls.length).toBeGreaterThan(0);
      // One whole-phrase decision and one failed quoted-left decision suffice. After the
      // split fails, rereading the complete quoted number cannot make a valid compound.
      expect(reader.mock.calls.filter(([tokens]) => tokens.length > 0)).toHaveLength(2);
      const chars = reader.mock.calls.reduce((sum, [tokens]) => sum + tokens.join(' ').length, 0);
      expect(chars).toBeLessThan(raw.length * 4);
    } finally {
      reader.mockRestore();
    }
  });

  it.each([
    ['m: one and eighty and five cm', 185, 1, 85],
    ['m: one hundred and one and eighty cm', 10180, 101, 80],
    ['m: one hundred and eighty cm', 10080, 100, 80],
  ] as const)('reads only one split with complete parts in %s', (raw, value, meters, cm) => {
    const reader = vi.spyOn(numbers, 'readNumberTokens');
    try {
      expect(parseMeasurement(raw)).toEqual({
        value,
        unit: 'cm',
        type: 'height',
        raw,
        matches: [
          { value: meters, unit: 'm' },
          { value: cm, unit: 'cm' },
        ],
      });
      expect(reader.mock.calls.length).toBeGreaterThan(0);
      expect(reader.mock.calls.filter(([tokens]) => tokens.length > 0)).toHaveLength(3);
      const chars = reader.mock.calls.reduce((sum, [tokens]) => sum + tokens.join(' ').length, 0);
      expect(chars).toBeLessThan(raw.length * 4);
    } finally {
      reader.mockRestore();
    }
  });

  it.each([8, 16, 32])('bounds malformed anchored compounds with %i conjunctions', count => {
    const raw = `m: one and ${'eighty and '.repeat(count)}five cm`;
    const reader = vi.spyOn(numbers, 'readNumberTokens');
    try {
      expect(parseMeasurement(raw)).toBeNull();
      expect(reader.mock.calls.length).toBeGreaterThan(0);
      const chars = reader.mock.calls.reduce((sum, [tokens]) => sum + tokens.join(' ').length, 0);
      expect(chars).toBeLessThan(raw.length * 4);
    } finally {
      reader.mockRestore();
    }
  });
});
