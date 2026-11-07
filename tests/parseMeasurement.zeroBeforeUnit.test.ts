// AFA-250: recovery expectations now follow the approved complete-entry contract in PARSING.md.
// Earlier ticket rationales below describe their historical extraction contract; original
// assertions are retained separately under design/afa-250.
import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

// AFA-81: a zero right before a unit is that unit's own number. The unit doesn't also take the
// next number when that number has its own unit, so the zero measurement doesn't count.
describe('a zero before a unit', () => {
  it.each(['0 cm, 1.8 m', '0 kg, 80 lb', '0 lb 80 kg', '0 cm; 180 in', '0 kg 70 lb'])(
    'rejects the complete entry %s (AFA-250)',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  // "Must not change" in AFA-81: the examples in PARSING.md.
  it.each(['0 feet; actual 1.8 meters', 'record 0; kg 70', '0 kg 70', 'record 0; kg 70 lb'])(
    'rejects the complete entry %s (AFA-250)',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );
  it.each([
    ['0-foot-11', 11, 'in'],
    ['5-foot-0-inches', 60, 'in'],
  ] as const)('keeps reading %s as %s %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit });
  });

  it('rejects two positive readings after an introductory word', () => {
    // AFA-250: the prefix still reads 72 kg, but cannot discard the independent 159 lb.
    expect(parseMeasurement('about kg 72 lbs 159')).toBeNull();
  });

  // A zero part of a height is that part's own number, so the weight after it stays a weight:
  // 1 m + 0 cm = 1 m.
  it.each([
    ['1 m 0 cm 80 kg', {}],
    ['1 m 0 cm 80 kg', { type: 'height' }],
  ] as const)('rejects the complete entry %s (AFA-250)', (raw, options) => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });

  // A height after a zero weight isn't the weight's number.
  it('returns null for a zero weight before a height, read as a weight', () => {
    expect(parseMeasurement('0 lbs 70 feet', { type: 'weight' })).toBeNull();
  });

  // A part in stone after a zero isn't the zero's unit's number, so the weight has a part in an
  // unsupported unit, which returns null (README).
  it('returns null for a zero weight before a part in stone', () => {
    expect(parseMeasurement('0 kg 70 st')).toBeNull();
  });
});
