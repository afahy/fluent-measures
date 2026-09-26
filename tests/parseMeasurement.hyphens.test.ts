import { describe, it, expect } from 'vitest';
import { parseMeasurement } from '../src';

describe('hyphenated heights', () => {
  it('reads bare shorthand only with an explicit height type', () => {
    expect(parseMeasurement('5-11', { type: 'height' })).toEqual({
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '5-11',
      matches: [
        { value: 5, unit: 'ft' },
        { value: 11, unit: 'in' },
      ],
    });
    expect(parseMeasurement('5-11')).toBeNull();
    expect(parseMeasurement('5-11', { normalizedUnit: 'in' })).toBeNull();
    expect(parseMeasurement('5-11', { type: 'weight' })).toBeNull();
    expect(parseMeasurement('5-11', { type: 'weight', allowUnqualified: true })).toBeNull();
  });

  it('reads the feet unit and trailing inches in 5-foot-11', () => {
    expect(parseMeasurement('5-foot-11')).toEqual({
      value: 71,
      unit: 'in',
      type: 'height',
      raw: '5-foot-11',
      matches: [
        { value: 5, unit: 'ft' },
        { value: 11, unit: 'in' },
      ],
    });
  });

  it.each([
    ['5-0', 60, 5, 0],
    ['0-11', 11, 0, 11],
    ['5-11.5', 71.5, 5, 11.5],
    ['  6-2  ', 74, 6, 2],
  ])('handles the components and preserves raw input in %s', (raw, value, feet, inches) => {
    expect(parseMeasurement(raw, { type: 'height' })).toEqual({
      value,
      unit: 'in',
      type: 'height',
      raw,
      matches: [
        { value: feet, unit: 'ft' },
        { value: inches, unit: 'in' },
      ],
    });
  });

  it('normalizes both shorthand components', () => {
    const result = parseMeasurement('5-11', { type: 'height', normalizedUnit: 'cm' });
    expect(result?.value).toBeCloseTo(180.34);
    expect(result?.unit).toBe('cm');
    expect(parseMeasurement('5-11', { type: 'height', normalizedUnit: 'ft' })?.value).toBeCloseTo(
      71 / 12
    );
    expect(parseMeasurement('5-11', { type: 'height', inferUnit: 'metric' })?.unit).toBe('in');
  });

  it.each(['5-12', '5-13', '0-0'])(
    'rejects invalid shorthand even with unqualified input enabled: %s',
    raw => {
      expect(parseMeasurement(raw, { type: 'height' })).toBeNull();
      expect(parseMeasurement(raw, { type: 'height', allowUnqualified: true })).toBeNull();
    }
  );

  it('rejects shorthand with a non-finite feet component', () => {
    expect(parseMeasurement(`${'9'.repeat(400)}-11`, { type: 'height' })).toBeNull();
  });

  it.each(['-5 feet', ' -5feet', 'height -5 feet', '\t-5.5 ft', '-5-11', '5--11'])(
    'preserves rejection of negative heights in %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
      expect(parseMeasurement(raw, { type: 'height' })).toBeNull();
    }
  );

  it.each(['5 11', 'prefix5-11', '5-11suffix', '5-11-2'])(
    'requires the whole input to be bare shorthand: %s',
    raw => {
      expect(parseMeasurement(raw, { type: 'height' })).toBeNull();
    }
  );
});
