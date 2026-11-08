// AFA-250: recovery expectations now follow the approved complete-entry contract in PARSING.md.
// Earlier ticket rationales below describe their historical extraction contract; original
// assertions are retained separately under design/afa-250.
import { describe, it, expect, vi } from 'vitest';
import { parseMeasurement } from '../src';
import * as numberWords from '../src/wordsToNumber';

describe('measurement number phrases', () => {
  it.each([
    ['one hundred fifty pounds', 150],
    ['one hundred and 50 pounds', 150],
    ['twenty-one pounds', 21],
    ['ten and one pounds', 11],
    ['1 hundred and fifty pounds', 150],
    ['one thousand two hundred and fifty pounds', 1250],
    ['I weigh one hundred fifty pounds', 150],
  ])('parses the complete phrase in %s', (raw, value) => {
    expect(parseMeasurement(raw)).toEqual({
      value,
      unit: 'lb',
      type: 'weight',
      raw,
      matches: [{ value, unit: 'lb' }],
    });
  });

  it.each([
    '140 and 150 pounds',
    '5 11 inches',
    '20 and 5 pounds',
    'one and two pounds',
    'one hundred and 150 pounds',
    'one hundred and two hundred pounds',
    '5 hundred and 6 hundred pounds',
    'one thousand and two thousand pounds',
  ])('rejects the complete entry %s (AFA-250)', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it.each([
    ['one hundred and .5 pounds', 100.5],
    ['.5 hundred pounds', 50],
    ['one hundred and .25 pounds', 100.25],
    ['.5 pounds', 0.5],
  ])('includes leading-dot decimals in %s', (raw, value) => {
    expect(parseMeasurement(raw)).toEqual({
      value,
      unit: 'lb',
      type: 'weight',
      raw,
      matches: [{ value, unit: 'lb' }],
    });
  });

  it('stops at an already matched unit', () => {
    // 21 in can't follow feet in one height, so centimeters after meters test the same phrase.
    const result = parseMeasurement('1 meter twenty one centimeters');
    expect(result?.value).toBe(121);
    expect(result?.unit).toBe('cm');
    expect(result?.matches).toEqual([
      { value: 1, unit: 'm' },
      { value: 21, unit: 'cm' },
    ]);
  });

  it('keeps adjacent digits and the number after a unit working', () => {
    expect(parseMeasurement('72.5 kg')?.value).toBe(72.5);
    expect(parseMeasurement('pounds 50')?.value).toBe(50);
    expect(parseMeasurement('zero pounds')).toBeNull();
    expect(parseMeasurement('zero and zero pounds')).toBeNull();
    expect(parseMeasurement('-5 feet')).toBeNull();
  });

  it.each([
    ['1 hundred fifty', 150],
    ['.5 hundred', 50],
    ['one hundred thousand two hundred fifty', 100250],
  ])('parses complete unqualified phrases in %s', (raw, value) => {
    expect(parseMeasurement(raw, { type: 'weight', defaultUnit: 'lb' })?.value).toBe(value);
  });

  it.each(['1 ', 'and '])('bounds phrase parsing work for a long run of %s', prefix => {
    const raw = prefix.repeat(1000) + '1 pounds';
    const parser = vi.spyOn(numberWords, 'readNumberTokens');
    try {
      // AFA-250: reject the invalid complete phrase; retain the historical work bound.
      expect(parseMeasurement(raw, { maxLength: Infinity })).toBeNull();
      expect(parser.mock.calls.length).toBeGreaterThan(0);
      const parsedCharacters = parser.mock.calls.reduce(
        (total, [phrase]) => total + phrase.join(' ').length,
        0
      );
      expect(parsedCharacters).toBeLessThan(raw.length * 4);
    } finally {
      parser.mockRestore();
    }
  });
});
