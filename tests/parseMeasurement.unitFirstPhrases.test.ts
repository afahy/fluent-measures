import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

describe('a number in words after its unit', () => {
  it.each([
    ['kg one hundred eighty', 180, 'kg', 'weight'],
    ['kg seventy two', 72, 'kg', 'weight'],
    ['kg one hundred and eighty', 180, 'kg', 'weight'],
    ['lbs one hundred fifty', 150, 'lb', 'weight'],
    ['cm one hundred eighty', 180, 'cm', 'height'],
    ['in: seventy two', 72, 'in', 'height'],
    ['Height (in): seventy-two', 72, 'in', 'height'],
  ] as const)('reads the whole number phrase in %s', (raw, value, unit, type) => {
    expect(parseMeasurement(raw)).toEqual({ value, unit, type, raw, matches: [{ value, unit }] });
  });

  it('gives a phrase with its own unit to that unit, not to the label before it', () => {
    const raw = 'Weigh in: one hundred eighty lbs';
    expect(parseMeasurement(raw)).toEqual({
      value: 180,
      unit: 'lb',
      type: 'weight',
      raw,
      matches: [{ value: 180, unit: 'lb' }],
    });
  });

  it.each([
    ['kg 70', 70, 'kg'],
    ['weight: kg 70', 70, 'kg'],
    ['record 0; kg seventy', 70, 'kg'],
    // Two numbers in a row aren't one phrase
    ['kg 70 5 days', 70, 'kg'],
    ['ft six', 6, 'ft'],
  ] as const)('keeps reading %s as before', (raw, value, unit) => {
    expect(parseMeasurement(raw)?.matches).toEqual([{ value, unit }]);
  });

  it('keeps reading consecutive unit-first fields as one height', () => {
    expect(parseMeasurement('ft five in: eleven')?.matches).toEqual([
      { value: 5, unit: 'ft' },
      { value: 11, unit: 'in' },
    ]);
    const result = parseMeasurement('m: one cm: eighty');
    expect(result?.value).toBe(180);
    expect(result?.unit).toBe('cm');
    expect(result?.matches).toEqual([
      { value: 1, unit: 'm' },
      { value: 80, unit: 'cm' },
    ]);
  });
});
