import { describe, expect, it, vi } from 'vitest';
import { parseMeasurement } from '../src';
import * as numbers from '../src/wordsToNumber';

// AFA-251: the shared cursor retains the original whole bare-number read. These independent
// quantities fail if the fallback reparses after a null expression or ignores the source unit.
describe('source defaults reuse the original numeric read', () => {
  it.each([
    ['80', 'kg', 'kg', 80],
    ['one point eight', 'm', 'cm', 180], // 1.8 * 100 = 180 cm
  ] as const)('reads %s only once', (raw, defaultUnit, normalizedUnit, value) => {
    const reader = vi.spyOn(numbers, 'readNumberTokens');
    try {
      expect(parseMeasurement(raw, { defaultUnit, normalizedUnit })).toMatchObject({
        value,
        unit: normalizedUnit,
        raw,
      });
      expect(reader).toHaveBeenCalledTimes(1);
      expect(reader.mock.calls[0][0]).toEqual(raw.split(' '));
    } finally {
      reader.mockRestore();
    }
  });
});
