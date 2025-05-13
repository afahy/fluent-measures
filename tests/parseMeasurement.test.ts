import { describe, it, expect } from 'vitest';
import { parseMeasurement } from '../src';

describe('parseMeasurement', () => {
  it('parses simple weight with unit', () => {
    const result = parseMeasurement('180 lbs', { type: 'weight' });
    expect(result).toEqual({
      matches: [
        {
          unit: 'lb',
          value: 180,
        },
      ],
      raw: '180 lbs',
      type: 'weight',
      unit: 'lb',
      value: 180,
    });
  });

  it('parses spelled-out weight', () => {
    const result = parseMeasurement('eighty kilograms', { type: 'weight' });
    expect(result).toEqual({
      matches: [
        {
          unit: 'kg',
          value: 80,
        },
      ],
      value: 80,
      unit: 'kg',
      type: 'weight',
      raw: 'eighty kilograms',
    });
  });

  it('parses height with feet only', () => {
    expect(parseMeasurement('six feet', { type: 'height' })).toEqual({
      matches: [
        {
          unit: 'ft',
          value: 6,
        },
      ],
      value: 6,
      unit: 'ft',
      type: 'height',
      raw: 'six feet',
    });

    expect(parseMeasurement('six feet')).toEqual({
      matches: [
        {
          unit: 'ft',
          value: 6,
        },
      ],
      value: 6,
      unit: 'ft',
      type: 'height',
      raw: 'six feet',
    });

    expect(parseMeasurement("6'")).toEqual({
      matches: [
        {
          unit: 'ft',
          value: 6,
        },
      ],
      value: 6,
      unit: 'ft',
      type: 'height',
      raw: "6'",
    });
  });

  it('parses height with feet and inches', () => {
    const result = parseMeasurement('5 feet 11 inches', {
      type: 'height',
      normalizedUnit: 'in',
    });
    expect(result).toEqual({
      value: 71,
      unit: 'in',
      type: 'height',
      matches: [
        { value: 5, unit: 'ft' },
        { value: 11, unit: 'in' },
      ],
      raw: '5 feet 11 inches',
    });
  });

  it('parses height with feet and inches using symbols', () => {
    const result = parseMeasurement('5\' 11"', {
      type: 'height',
      normalizedUnit: 'in',
    });
    expect(result).toEqual({
      value: 71,
      unit: 'in',
      type: 'height',
      matches: [
        { value: 5, unit: 'ft' },
        { value: 11, unit: 'in' },
      ],
      raw: '5\' 11"',
    });
  });

  it('normalizes to centimeters', () => {
    const result = parseMeasurement('5\' 11"', {
      type: 'height',
      normalizedUnit: 'cm',
    });
    expect(result).toEqual({
      value: 180.34,
      unit: 'cm',
      type: 'height',
      matches: [
        { value: 5, unit: 'ft' },
        { value: 11, unit: 'in' },
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
      matches: [
        {
          unit: 'kg',
          value: 180,
        },
      ],
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

  it('parses decimal weights', () => {
    expect(parseMeasurement('72.5 kg')).toEqual({
      matches: [
        {
          unit: 'kg',
          value: 72.5,
        },
      ],
      value: 72.5,
      unit: 'kg',
      type: 'weight',
      raw: '72.5 kg',
    });

    expect(parseMeasurement('158.5 pounds')).toEqual({
      matches: [
        {
          unit: 'lb',
          value: 158.5,
        },
      ],
      value: 158.5,
      unit: 'lb',
      type: 'weight',
      raw: '158.5 pounds',
    });
  });

  it('parses height in metric units', () => {
    expect(parseMeasurement('175cm', { type: 'height' })).toEqual({
      matches: [
        {
          unit: 'cm',
          value: 175,
        },
      ],
      value: 175,
      unit: 'cm',
      type: 'height',
      raw: '175cm',
    });

    expect(parseMeasurement('1.75 meters', { type: 'height' })).toEqual({
      matches: [
        {
          unit: 'm',
          value: 1.75,
        },
      ],
      value: 1.75,
      unit: 'm',
      type: 'height',
      raw: '1.75 meters',
    });
  });

  it('handles various unit spellings and abbreviations', () => {
    expect(parseMeasurement('180 pounds', { type: 'weight' })).toEqual({
      matches: [
        {
          unit: 'lb',
          value: 180,
        },
      ],
      value: 180,
      unit: 'lb',
      type: 'weight',
      raw: '180 pounds',
    });

    expect(parseMeasurement('180 lb.', { type: 'weight' })).toEqual({
      matches: [
        {
          unit: 'lb',
          value: 180,
        },
      ],
      value: 180,
      unit: 'lb',
      type: 'weight',
      raw: '180 lb.',
    });

    expect(parseMeasurement('six foot', { type: 'height' })).toEqual({
      matches: [
        {
          unit: 'ft',
          value: 6,
        },
      ],
      value: 6,
      unit: 'ft',
      type: 'height',
      raw: 'six foot',
    });
  });

  it('handles mixed case input', () => {
    expect(parseMeasurement('Six Feet Two Inches', { type: 'height' })).toEqual({
      matches: [
        {
          unit: 'ft',
          value: 6,
        },
        {
          unit: 'in',
          value: 2,
        },
      ],
      value: 74,
      unit: 'in',
      type: 'height',
      raw: 'Six Feet Two Inches',
    });

    expect(parseMeasurement('EIGHTY KG', { type: 'weight' })).toEqual({
      matches: [
        {
          unit: 'kg',
          value: 80,
        },
      ],
      value: 80,
      unit: 'kg',
      type: 'weight',
      raw: 'EIGHTY KG',
    });
  });

  it('handles various whitespace patterns', () => {
    expect(parseMeasurement('5\'   11"', { type: 'height' })).toEqual({
      matches: [
        { value: 5, unit: 'ft' },
        { value: 11, unit: 'in' },
      ],
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '5\'   11"',
    });

    expect(parseMeasurement('   180    lbs   ', { type: 'weight' })).toEqual({
      matches: [
        {
          unit: 'lb',
          value: 180,
        },
      ],
      value: 180,
      unit: 'lb',
      type: 'weight',
      raw: '   180    lbs   ',
    });
  });

  it('handles edge cases and invalid inputs', () => {
    expect(parseMeasurement('')).toBeNull();
    expect(parseMeasurement('   ')).toBeNull();
    expect(parseMeasurement('0 kg')).toBeNull();
    expect(parseMeasurement('-5 feet')).toBeNull();
    expect(parseMeasurement('very tall')).toBeNull();
  });
});
