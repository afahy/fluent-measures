// AFA-250: recovery expectations now follow the approved complete-entry contract in PARSING.md.
// Earlier ticket rationales below describe their historical extraction contract; original
// assertions are retained separately under design/afa-250.
// AFA-250: generated arbitrary labels remain in these tests and now reject the whole entry.
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
    expect.assertions(3);
    for (const value of [5, 72, 180]) {
      const raw = `${label},${value} kg`;
      expect(parseMeasurement(raw)).toBeNull();
    }
  });

  it('preserves the height measurement after a digit-suffixed label', () => {
    const raw = 'phase2,180 cm';
    expect(parseMeasurement(raw)).toBeNull();
    expect(tokenize(raw).map(({ text }) => text)).toEqual(['phase2', ',', '180', 'cm']);
  });

  it.each([
    ['phase2,72,5 kg', 72.5],
    ['poidsé,72,5 kg', 72.5],
    ['phase2,1,000 kg', 1000],
    ['重量,1,000 kg', 1000],
  ])('rejects an unrelated label before normalized numeric text in %s', (raw, _value) => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it.each(['phase2,72,5-80,5 kg', '重量,1,000-2,000 kg'])(
    'still rejects the complete range after a label in %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  it('rejects a long unrelated digit-suffixed label', () => {
    const raw = `phase${'2'.repeat(10000)},180 cm`;
    expect(parseMeasurement(raw, { maxLength: Infinity })).toBeNull();
  });
});

// Historical AFA-165/179 cases remain here. AFA-250 now rejects the entire unrelated label;
// original recovery expectations are preserved in the migration artifacts.
describe('a label that ends in a number word', () => {
  it('rejects an unrelated label before the comma', () => {
    expect(parseMeasurement('phase twenty, 10 cm')).toBeNull();
  });
});
