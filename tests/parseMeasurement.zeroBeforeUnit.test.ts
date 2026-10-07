import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

// AFA-81: a zero right before a unit is that unit's own number. The unit doesn't also take the
// next number when that number has its own unit, so the zero measurement doesn't count.
describe('a zero before a unit', () => {
  it.each([
    // The inputs from AFA-81.
    ['0 cm, 1.8 m', 1.8, 'm'],
    ['0 kg, 80 lb', 80, 'lb'],
    ['0 lb 80 kg', 80, 'kg'],
    ['0 cm; 180 in', 180, 'in'],
    // The same rule when the next number's unit follows right after it.
    ['0 kg 70 lb', 70, 'lb'],
  ] as const)('reads %s as %s %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit });
  });

  // "Must not change" in AFA-81, from the README. A number with no unit of its own after a unit
  // still belongs to it, as in "kg 70", also after a zero in another field.
  it.each([
    ['0 feet; actual 1.8 meters', 1.8, 'm'],
    ['record 0; kg 70', 70, 'kg'],
    ['0-foot-11', 11, 'in'],
    ['5-foot-0-inches', 60, 'in'],
    ['0 kg 70', 70, 'kg'],
    // A zero in an earlier field isn't the unit's own number, so the unit takes the next number,
    // as in "kg 72 lbs 159" (72 kg, existing test).
    ['record 0; kg 70 lb', 70, 'kg'],
    // The rule is only for a zero. With a word before the prefix, "kg" still takes 72, as without it.
    ['about kg 72 lbs 159', 72, 'kg'],
  ] as const)('keeps reading %s as %s %s', (raw, value, unit) => {
    expect(parseMeasurement(raw)).toMatchObject({ value, unit });
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
