import { describe, it, expect } from 'vitest';
import { parseMeasurement } from '../src';

describe('separator boundaries before comma numbers', () => {
  it.each([
    ['phase-2,72 kg', 2.72, 'kg'],
    ['phase-2,180 cm', 2180, 'cm'],
    ['phase 2,180 cm', 2180, 'cm'],
    ['weight 72,5 kg', 72.5, 'kg'],
    ['height-1,800 cm', 1800, 'cm'],
    ['weight-72,5 kg', 72.5, 'kg'],
    ['5 ft-11,5 in', 71.5, 'in'],
    ['phase-2, 180 cm', 180, 'cm'],
    ['phase 2, 180 cm', 180, 'cm'],
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
