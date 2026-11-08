import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions } from '../src';

// README's 6 ft result and main's absent-field behavior, independently specified.
describe('runtime null option sentinels', () => {
  it.each([{ type: null }, { normalizedUnit: null }])('treats %o as absent', options => {
    expect(parseMeasurement('6 ft', options as unknown as ParseOptions)).toEqual({
      value: 6,
      unit: 'ft',
      type: 'height',
      matches: [{ value: 6, unit: 'ft' }],
      raw: '6 ft',
    });
  });

  // The approved options-shape revision is distinct from null fields in a valid object.
  it.each([null, [], 'x', 5, true].map(options => ({ options })))(
    'keeps rejecting options container %j',
    ({ options }) => {
      expect(() => parseMeasurement('6 ft', options as unknown as ParseOptions)).toThrow(
        new TypeError('options must be an object')
      );
    }
  );

  it('keeps null source defaults invalid', () => {
    expect(() =>
      parseMeasurement('6 ft', { defaultUnit: null } as unknown as ParseOptions)
    ).toThrow(new TypeError('defaultUnit must be ft, in, cm, m, lb or kg'));
  });
});
