import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

describe('the word "in" before a number', () => {
  it.each([
    ['lost 5 lbs in 3 weeks', 5, 'lb', 'weight'],
    ['weighed 70 kg in 2020', 70, 'kg', 'weight'],
    ['I was 180 lbs in 2019', 180, 'lb', 'weight'],
    ['gained 10 kg in six months', 10, 'kg', 'weight'],
    ['in 2024 I weighed 80 kg', 80, 'kg', 'weight'],
    ['born in 1990, 180 cm', 180, 'cm', 'height'],
  ] as const)('reads "in" as a preposition in %s', (raw, value, unit, type) => {
    expect(parseMeasurement(raw)).toEqual({ value, unit, type, raw, matches: [{ value, unit }] });
  });

  it('returns null when "in" is the only unit and comes before the number', () => {
    expect(parseMeasurement('in 5')).toBeNull();
  });

  it('finds no height when the only "in" is a preposition', () => {
    expect(parseMeasurement('weighed 70 kg in 2020', { type: 'height' })).toBeNull();
  });

  it('reads ft 5 in 11 as feet only, because "in" no longer takes the number after it', () => {
    const raw = 'ft 5 in 11';
    expect(parseMeasurement(raw)).toEqual({
      value: 5,
      unit: 'ft',
      type: 'height',
      raw,
      matches: [{ value: 5, unit: 'ft' }],
    });
  });

  it.each([
    ['kg 70', 70, 'kg', 'weight'],
    ['cm 180', 180, 'cm', 'height'],
    ['ft 6', 6, 'ft', 'height'],
    ['inches 70', 70, 'in', 'height'],
  ] as const)('still reads other units before their number in %s', (raw, value, unit, type) => {
    expect(parseMeasurement(raw)).toEqual({ value, unit, type, raw, matches: [{ value, unit }] });
  });

  it.each([
    ['5 in', 5],
    ['70 in', 70],
  ])('still reads "in" after a number as inches in %s', (raw, value) => {
    expect(parseMeasurement(raw)).toEqual({
      value,
      unit: 'in',
      type: 'height',
      raw,
      matches: [{ value, unit: 'in' }],
    });
  });

  it('still reads 5 ft 11 in as a compound height', () => {
    const raw = '5 ft 11 in';
    expect(parseMeasurement(raw)).toEqual({
      value: 71,
      unit: 'in',
      type: 'height',
      raw,
      matches: [
        { value: 5, unit: 'ft' },
        { value: 11, unit: 'in' },
      ],
    });
  });
});
