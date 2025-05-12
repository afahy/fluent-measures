import { describe, it, expect } from 'vitest';
import { parseMeasurement } from '../src';

describe('parseMeasurement', () => {
  it('parses simple weight with unit', () => {
    const result = parseMeasurement('180 lbs', { type: 'weight' });
    expect(result).toEqual({
      value: 180,
      unit: 'lb',
      type: 'weight',
      raw: '180 lbs',
    });
  });

  it('parses spelled-out weight', () => {
    const result = parseMeasurement('eighty kilograms', { type: 'weight' });
    expect(result).toEqual({
      value: 80,
      unit: 'kg',
      type: 'weight',
      raw: 'eighty kilograms',
    });
  });

  it('parses height with feet only', () => {
    const result = parseMeasurement('six feet', { type: 'height' });
    expect(result).toEqual({
      value: 6,
      unit: 'ft',
      type: 'height',
      raw: 'six feet',
    });
  });

  it('parses height with feet and inches', () => {
    const result = parseMeasurement('5 feet 11 inches', {
      type: 'height',
      returnComponents: true,
      normalizedUnit: 'in',
    });
    expect(result).toEqual({
      value: 71,
      unit: 'in',
      type: 'height',
      components: [
        { value: 5, unit: 'ft', match: '5 feet' },
        { value: 11, unit: 'in', match: '11 inches' },
      ],
      raw: '5 feet 11 inches',
    });
  });

  it('parses height with feet and inches using symbols', () => {
    const result = parseMeasurement('5\' 11"', {
      type: 'height',
      returnComponents: true,
      normalizedUnit: 'in',
    });
    expect(result).toEqual({
      value: 71,
      unit: 'in',
      type: 'height',
      components: [
        { value: 5, unit: 'ft', match: "5'" },
        { value: 11, unit: 'in', match: '11"' },
      ],
      raw: '5\' 11"',
    });
  });

  it('normalizes to centimeters', () => {
    const result = parseMeasurement('5\' 11"', {
      type: 'height',
      returnComponents: true,
      normalizedUnit: 'cm',
    });
    expect(result).toEqual({
      value: 180.34,
      unit: 'cm',
      type: 'height',
      components: [
        { value: 5, unit: 'ft', match: "5'" },
        { value: 11, unit: 'in', match: '11"' },
      ],
      raw: '5\' 11"',
    });
  });

  it('handles unqualified input with metric preference', () => {
    const result = parseMeasurement('180', {
      allowUnqualified: true,
      type: 'weight',
      inferUnit: 'metric',
    });
    expect(result).toEqual({
      value: 180,
      unit: 'kg',
      type: 'weight',
      raw: '180',
    });
  });

  it('returns null on unknown input', () => {
    const result = parseMeasurement('giraffe moon');
    expect(result).toBeNull();
  });
});
