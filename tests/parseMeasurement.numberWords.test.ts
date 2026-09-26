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
    ['140 and 150 pounds', 150, 'lb', 'weight'],
    ['5 11 inches', 11, 'in', 'height'],
    ['20 and 5 pounds', 5, 'lb', 'weight'],
    ['one and two pounds', 2, 'lb', 'weight'],
    ['one hundred and 150 pounds', 150, 'lb', 'weight'],
    ['one hundred and two hundred pounds', 200, 'lb', 'weight'],
    ['5 hundred and 6 hundred pounds', 600, 'lb', 'weight'],
    ['one thousand and two thousand pounds', 2000, 'lb', 'weight'],
  ])('keeps independent values separate in %s', (raw, value, unit, type) => {
    expect(parseMeasurement(raw)).toEqual({
      value,
      unit,
      type,
      raw,
      matches: [{ value, unit }],
    });
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
    expect(parseMeasurement('5 feet twenty one inches')).toEqual({
      value: 81,
      unit: 'in',
      type: 'height',
      raw: '5 feet twenty one inches',
      matches: [
        { value: 5, unit: 'ft' },
        { value: 21, unit: 'in' },
      ],
    });
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
    expect(parseMeasurement(raw, { type: 'weight', allowUnqualified: true })?.value).toBe(value);
  });

  it.each(['1 ', 'and '])('bounds phrase parsing work for a long run of %s', prefix => {
    const raw = prefix.repeat(1000) + '1 pounds';
    const parser = vi.spyOn(numberWords, 'wordsToNumber');
    try {
      expect(parseMeasurement(raw)?.value).toBe(1);
      const parsedCharacters = parser.mock.calls.reduce(
        (total, [phrase]) => total + phrase.length,
        0
      );
      expect(parsedCharacters).toBeLessThan(raw.length * 4);
    } finally {
      parser.mockRestore();
    }
  });
});
