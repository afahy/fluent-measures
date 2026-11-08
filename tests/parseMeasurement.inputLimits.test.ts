import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions } from '../src';

// AFA-183: reject runtime inputs before reading options or processing text. The public parameter
// stays string; assertions deliberately pass values that JavaScript and unvalidated JSON can send.
describe('measurement input limits', () => {
  it.each([
    { input: ['6 ft'] },
    { input: 72 },
    { input: {} },
    { input: null },
    { input: undefined },
    { input: true },
    { input: Symbol('6 ft') },
    { input: 72n },
    { input: Object('6 ft') },
  ])('returns null for non-string input $input', ({ input }) => {
    expect(parseMeasurement(input as string)).toBeNull();
  });

  it('does not read a non-string input or its options', () => {
    const input = {
      get trim(): never {
        throw new Error('input was processed');
      },
    };
    const options = {
      get maxLength(): never {
        throw new Error('options were read');
      },
    };
    expect(parseMeasurement(input as unknown as string, options)).toBeNull();
    expect(parseMeasurement(72 as unknown as string, null as unknown as ParseOptions)).toBeNull();
  });

  // These exact inputs and expected results come from the ticket. The length includes trailing
  // spaces, even though the parser trims them before looking for measurements.
  it('returns null for 1001 raw characters before trimming', () => {
    expect(parseMeasurement('5 ft' + ' '.repeat(997))).toBeNull();
  });

  it('accepts exactly 1000 raw characters by default', () => {
    const raw = '5 ft' + ' '.repeat(996);
    expect(parseMeasurement(raw)).toEqual({
      value: 5,
      unit: 'ft',
      type: 'height',
      matches: [{ value: 5, unit: 'ft' }],
      raw,
    });
  });

  it.each([2000, Infinity])('accepts 1001 raw characters with maxLength %s', maxLength => {
    expect(parseMeasurement('5 ft' + ' '.repeat(997), { maxLength })).toMatchObject({
      value: 5,
      unit: 'ft',
    });
  });

  it('uses the default when maxLength is explicitly undefined', () => {
    expect(parseMeasurement('5 ft', { maxLength: undefined })).toMatchObject({ value: 5 });
    expect(parseMeasurement('5 ft' + ' '.repeat(997), { maxLength: undefined })).toBeNull();
  });

  it.each([4, 4.5])('accepts an input at or below a custom limit of %s', maxLength => {
    expect(parseMeasurement('5 ft', { maxLength })).toMatchObject({ value: 5, unit: 'ft' });
    expect(parseMeasurement('5 ft ', { maxLength })).toBeNull();
  });

  it('accepts the smallest valid limit', () => {
    expect(parseMeasurement('5', { maxLength: 1, defaultUnit: 'in' })).toMatchObject({
      value: 5,
      unit: 'in',
    });
    expect(parseMeasurement('5 ', { maxLength: 1, defaultUnit: 'in' })).toBeNull();
  });

  it('checks raw length before normalization but after option validation', () => {
    // Two UTF-16 code units, though normalization expands ½ to three characters (1/2).
    expect(parseMeasurement('½m', { maxLength: 2 })).toMatchObject({ value: 0.5, unit: 'm' });
    expect(() =>
      parseMeasurement('5 ft', { maxLength: 3, allowUnqualified: true } as unknown as ParseOptions)
    ).toThrow('allowUnqualified was removed; use defaultUnit');
  });

  it.each([0, -1, 0.5, NaN, -Infinity, '1000', null, true, {}, Symbol('private value')])(
    'rejects invalid maxLength %o without including its value',
    maxLength => {
      const options = { maxLength } as ParseOptions;
      expect(() => parseMeasurement('5 ft', options)).toThrow(
        new Error('maxLength must be a number of at least 1')
      );
    }
  );

  it('validates maxLength even for empty or overlong strings', () => {
    expect(() => parseMeasurement('', { maxLength: 0 })).toThrow();
    expect(() => parseMeasurement('5 ft' + ' '.repeat(997), { maxLength: 0 })).toThrow();
  });

  it('keeps throwing for null options with string input', () => {
    expect(() => parseMeasurement('5 ft', null as unknown as ParseOptions)).toThrow(TypeError);
  });

  it('rejects null options even for empty strings', () => {
    expect(() => parseMeasurement('', null as unknown as ParseOptions)).toThrow(TypeError);
    expect(() => parseMeasurement('   ', null as unknown as ParseOptions)).toThrow(TypeError);
  });
});
