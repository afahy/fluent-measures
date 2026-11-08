// AFA-250: recovery expectations now follow the approved complete-entry contract in PARSING.md.
// Earlier ticket rationales below describe their historical extraction contract; original
// assertions are retained separately under design/afa-250.
import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

describe('a label reads the number after it', () => {
  it.each([
    'age=28, in=72',
    'age: 28, in: 72',
    'age=28&in=72',
    'id=7, m=1.8',
    'age: 30, m: 1.8',
    'age 28, Height (in): 72',
    'age 28 (in): 72',
    'id 7 (m): 1.8',
    'age 28 in. 72',
  ])('rejects the complete entry %s (AFA-250)', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it.each(['72 in: height', '72 (in): height'])('rejects the complete entry %s (AFA-250)', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });
  it.each([
    ['72 (in)', 72],
    ['Height (in): 72', 72],
    ['in: 72', 72],
  ])('reads a complete unit suffix or forward label in %s', (raw, value) => {
    expect(parseMeasurement(raw)?.matches).toEqual([{ value, unit: 'in' }]);
  });

  it('keeps a compound height with an inch abbreviation', () => {
    expect(parseMeasurement('5 ft 11 in.')?.matches).toEqual([
      { value: 5, unit: 'ft' },
      { value: 11, unit: 'in' },
    ]);
  });

  it('keeps consecutive label fields as one height', () => {
    const result = parseMeasurement('m: 1 cm: 80');
    expect(result?.value).toBe(180);
    expect(result?.unit).toBe('cm');
    expect(result?.matches).toEqual([
      { value: 1, unit: 'm' },
      { value: 80, unit: 'cm' },
    ]);
  });

  it.each([
    ['72 (in), 180 lbs', {}],
    ['72 (in) 180 lbs', {}],
    ['72 in. 180 lbs', {}],
    ['1.8 (m), 80 kg', {}],
  ] as const)('rejects the complete entry %s (AFA-250)', (raw, options) => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });
  it.each([
    ['72 (in), 180 lbs', { type: 'height' }, 72, 'in'],
    ['1.8 (m), 80 kg', { type: 'height' }, 1.8, 'm'],
    ['1.8 (m), 80 kg', { type: 'weight' }, 80, 'kg'],
    ['1.8 (m), 80 kg', { normalizedUnit: 'cm' }, 1.8, 'm'],
    ['1.8 (m), 80 kg', { normalizedUnit: 'kg' }, 80, 'kg'],
  ] as const)(
    'selects the source match from two complete expressions in %s',
    (raw, options, value, unit) => {
      expect(parseMeasurement(raw, options)?.matches).toEqual([{ value, unit }]);
    }
  );

  it.each([
    'age=28, in=180 lbs',
    'age=28; in=180 lbs',
    'age=28&in=180 lbs',
    'age=28, (in) 180 lbs',
    'age=28, in=72 cm',
    'age: 28, m: 80 kg',
  ])('rejects the complete entry %s (AFA-250)', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it.each([
    '72 in: 180 lbs',
    'age=28 in=180 lbs',
    'age 28 in=180 lbs',
    'age: 28 in: 180 lbs',
    'age 28 in: 180 lbs',
    'age=28 in=72 cm',
    '72 (in): 180 lbs',
    'age 28 (in): 180 lbs',
    'age 28 [in]: 180 lbs',
    'age 28 (in) = 180 lbs',
    'age 28 (m): 80 kg',
    'age 28 (in): 72 cm',
  ])('rejects the complete entry %s (AFA-250)', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it.each(['age=28, in=0', 'id=7, m=0', 'age 28 in=0', 'age=28, in:'])(
    "doesn't take the number before it when its own value is zero or missing, in %s",
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  it('rejects conflicting field declarations', () => {
    expect(parseMeasurement('age 28, weigh in: 180 lbs')).toBeNull();
    expect(parseMeasurement('M: 5\'11"')).toBeNull();
  });
});
