// AFA-250: recovery expectations now follow the approved complete-entry contract in PARSING.md.
// Earlier ticket rationales below describe their historical extraction contract; original
// assertions are retained separately under design/afa-250.
import { describe, it, expect } from 'vitest';
import { parseMeasurement } from '../src';

describe('separator boundaries before comma numbers', () => {
  it.each([
    'phase-2,72 kg',
    'phase-2,180 cm',
    'phase 2,180 cm',
    'height-1,800 cm',
    'weight-72,5 kg',
    'phase-2, 180 cm',
    'phase 2, 180 cm',
  ])('rejects the complete entry %s (AFA-250)', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });
  it.each([
    ['weight 72,5 kg', 72.5, 'kg'],
    ['5 ft-11,5 in', 71.5, 'in'],
  ])('preserves numeric formatting or an explicit separator in %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit, raw });
  });

  it.each(['kg-72,5 kg', 'ft-5,5 in', '-2,180 cm'])(
    'keeps signed measurements invalid in %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );
});
