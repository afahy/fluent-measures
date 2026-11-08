// AFA-250: recovery expectations now follow the approved complete-entry contract in PARSING.md.
// Earlier ticket rationales below describe their historical extraction contract; original
// assertions are retained separately under design/afa-250.
import { describe, it, expect } from 'vitest';
import { parseMeasurement } from '../src';

describe('bare inches after feet', () => {
  it.each([
    ['five foot ten', { type: 'height' as const }, 70, 10],
    ['5 ft 11', {}, 71, 11],
    ["5'11", {}, 71, 11],
    ['5 feet eleven', {}, 71, 11],
    ['5 ft 11.5', {}, 71.5, 11.5],
    ['ft 5 11', {}, 71, 11],
  ])('includes the trailing inches in %s', (raw, options, value, inches) => {
    expect(parseMeasurement(raw, options)).toEqual({
      value,
      unit: 'in',
      type: 'height',
      raw,
      matches: [
        { value: 5, unit: 'ft' },
        { value: inches, unit: 'in' },
      ],
    });
  });

  it('normalizes the inferred inches with the feet', () => {
    expect(parseMeasurement('5 ft 11', { normalizedUnit: 'cm' })?.value).toBeCloseTo(180.34);
  });

  it.each([
    '5 ft 11 200 lbs',
    '5 ft ten 200 lbs',
    '5 ft ten and one 200 lbs',
    '5 ft 11 two hundred pounds',
    '5 ft 11 and 200 lbs',
    '5 ft 11 and two hundred pounds',
    '5 ft ten and one and 200 lbs',
    '5 ft 11 and 6 lbs',
    '5 ft 11 and six pounds',
    '5 ft eleven and 6 lbs',
    '5 ft eleven and six pounds',
    '5 ft one and two pounds',
    '5 ft 1 and 2 pounds',
    '5 ft ten and one and six pounds',
  ])('rejects the complete entry %s (AFA-250 policy revision)', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it.each(['5 ft 10 in', '5 ft ten inches', '5 ft ten and one inches'])(
    'does not double count explicit inches in %s',
    raw => {
      const result = parseMeasurement(raw);
      expect(result?.matches).toEqual([
        { value: 5, unit: 'ft' },
        { value: raw.includes('one') ? 11 : 10, unit: 'in' },
      ]);
      expect(result?.value).toBe(raw.includes('one') ? 71 : 70);
    }
  );

  it.each(['5 ft 180 lbs', '5 ft 10 lbs', '5 ft two kg', '5 ft twenty two pounds'])(
    'rejects the complete entry %s (AFA-250 policy revision)',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  it('rejects an incompatible metric component after feet', () => {
    // 10 cm isn't read as inches, and it doesn't agree with 5 ft, so there's no single answer.
    expect(parseMeasurement('5 ft 10 cm', { normalizedUnit: 'cm' })).toBeNull();
  });

  it.each(['5 ft 0', '5 ft 12', '5 ft 13', '5 ft -11', '5 ft twenty one'])(
    'rejects the complete entry %s (AFA-250 policy revision)',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );
});
