import { describe, it, expect } from 'vitest';
import { parseMeasurement } from '../src';
import { tokenize } from '../src/tokenize';

describe('commas separating labels from measurements', () => {
  it.each([
    'poidsé',
    'poidse\u0301',
    '重量',
    'вес',
    'وزن',
    'label_',
    'phase2',
    'phase_12',
    'étape2',
    '阶段2',
    'مرحلة٢',
    'version2.5',
  ])('keeps the separator after %s', label => {
    for (const value of [5, 72, 180]) {
      const raw = `${label},${value} kg`;
      expect(parseMeasurement(raw)).toEqual({
        value,
        unit: 'kg',
        type: 'weight',
        raw,
        matches: [{ value, unit: 'kg' }],
      });
    }
  });

  it('preserves the height measurement after a digit-suffixed label', () => {
    const raw = 'phase2,180 cm';
    expect(parseMeasurement(raw)).toEqual({
      value: 180,
      unit: 'cm',
      type: 'height',
      raw,
      matches: [{ value: 180, unit: 'cm' }],
    });
    expect(tokenize(raw)).toEqual(['phase2', '180', 'cm']);
  });

  it.each([
    ['phase2,72,5 kg', 72.5],
    ['poidsé,72,5 kg', 72.5],
    ['phase2,1,000 kg', 1000],
    ['重量,1,000 kg', 1000],
  ])('normalizes the measurement after the label in %s', (raw, value) => {
    expect(parseMeasurement(raw)?.value).toBe(value);
  });

  it.each(['phase2,72,5-80,5 kg', '重量,1,000-2,000 kg'])(
    'still rejects the complete range after a label in %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  it('handles a long digit-suffixed label without merging its measurement', () => {
    const raw = `phase${'2'.repeat(10000)},180 cm`;
    expect(parseMeasurement(raw)?.value).toBe(180);
  });
});
