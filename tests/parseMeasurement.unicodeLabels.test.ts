// AFA-250: recovery expectations now follow the approved complete-entry contract in PARSING.md.
// Earlier ticket rationales below describe their historical extraction contract; original
// assertions are retained separately under design/afa-250.
import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

describe('a label alias after a non-ASCII letter', () => {
  it.each([
    // Micro sign, U+00B5: micrometres aren't meters
    'µm: 5',
    // Greek small letter mu, U+03BC
    'μm: 5',
    '漢in: 72',
    'éin: 72',
    'µm = 5',
    'éin. 5',
  ])('is part of the word, not a label, in %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it.each(['Höhe in: 72', 'Höhe (in): 72', 'Longueur (m): 1.8', '2in: 5'])(
    'rejects the complete entry %s (AFA-250)',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );
  it.each([
    ['in: 72', 72, 'in'],
    ['Height (in): 72', 72, 'in'],
  ] as const)('keeps reading %s as before', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toEqual({
      value,
      unit,
      type: 'height',
      raw,
      matches: [{ value, unit }],
    });
  });
});
