import { describe, it, expect } from 'vitest';
import { parseMeasurement } from '../src';

describe('hyphenated height review regressions', () => {
  it.each(['0-foot-11', '0-ft-11', '0\'-11"', '0-foot-11-inches', 'zero-foot-eleven'])(
    'preserves the zero-foot component in %s',
    raw => {
      expect(parseMeasurement(raw)).toEqual({
        value: 11,
        unit: 'in',
        type: 'height',
        raw,
        matches: [
          { value: 0, unit: 'ft' },
          { value: 11, unit: 'in' },
        ],
      });
    }
  );

  it.each(['5\'-11"', "5'-11", '5-ft-11-in'])(
    'recognizes a separator after the feet unit in %s',
    raw => {
      expect(parseMeasurement(raw)?.value).toBe(71);
      expect(parseMeasurement(raw)?.unit).toBe('in');
    }
  );

  it.each(['150-180 lbs', '50-70 kg', '150.5-180.5 pounds', '50-.7 kg', '5-11 inches', '1-2 m'])(
    'rejects numeric ranges in %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
      expect(parseMeasurement(raw, { type: 'weight', allowUnqualified: true })).toBeNull();
      expect(parseMeasurement(raw, { type: 'height', allowUnqualified: true })).toBeNull();
    }
  );

  it.each(['5-11', '5-foot-11', '5\'-11"'])('normalizes %s to meters', raw => {
    const result = parseMeasurement(raw, { type: 'height', normalizedUnit: 'm' });
    expect(result?.value).toBeCloseTo(1.8034);
    expect(result?.unit).toBe('m');
  });

  it.each(['--5 kg', 'height --5 ft', '--5 feet', '--five feet', '--5-foot-11', '-0-foot-11'])(
    'rejects signed or repeated-sign heights and weights in %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  it.each(['0-foot-0', '0-foot-12', '0 feet', 'zero feet'])(
    'rejects an invalid total or bare inch component in %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  it.each(['"-5 ft"', 'weight "-70 kg"', "'-5 ft'", "weight '-70 kg'"])(
    'preserves a minus after an opening quote in %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  it.each(['recorded 2025-09-01 at 180 lbs', 'record 12-34 weighs 180 lbs'])(
    'ignores unrelated numeric hyphens in %s',
    raw => {
      expect(parseMeasurement(raw)?.value).toBe(180);
      expect(parseMeasurement(raw)?.unit).toBe('lb');
    }
  );

  it.each(['0 feet, 180 lbs', 'zero feet, 180 lbs'])(
    'continues to a valid weight after an empty height in %s',
    raw => {
      expect(parseMeasurement(raw)?.value).toBe(180);
      expect(parseMeasurement(raw)?.unit).toBe('lb');
    }
  );

  it.each(['weight - kg 70', 'weight -- kg 70'])(
    'allows a unit-prefix value after a prose separator in %s',
    raw => {
      expect(parseMeasurement(raw)?.value).toBe(70);
      expect(parseMeasurement(raw)?.unit).toBe('kg');
    }
  );

  it.each(['weight_-70 kg', 'height_-5 feet', 'weight: -70 kg'])(
    'preserves negative signs after labels in %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  it.each(['kg-70.5', 'pounds-150', 'weight kg-70.5', 'ft-5', 'inches-11', 'kg-.5'])(
    'rejects negative values attached to a unit prefix in %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  it.each(['kg 50-70', 'pounds 150-180', 'kg .5-.7', 'cm 150.5-180.5', 'ft5-11'])(
    'rejects ranges after a unit prefix in %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  it.each(['0 feet, 180 lbs', 'zero feet, 180 lbs'])(
    'normalizes the valid weight after a zero-height fragment in %s',
    raw => {
      expect(parseMeasurement(raw, { normalizedUnit: 'lb' })?.value).toBe(180);
      expect(parseMeasurement(raw, { normalizedUnit: 'kg' })?.value).toBeCloseTo(81.6466266);
    }
  );

  it.each(['5-foot-0-inches', '5 feet zero inches', '5\'-0"'])(
    'retains explicit zero inches in %s',
    raw => {
      expect(parseMeasurement(raw)).toEqual({
        value: 60,
        unit: 'in',
        type: 'height',
        raw,
        matches: [
          { value: 5, unit: 'ft' },
          { value: 0, unit: 'in' },
        ],
      });
    }
  );

  it.each(['-5\'-11"', '-0\'-11"', '-5.5\'-11"', '-5-foot-11-inches', '--5\'-11"'])(
    'rejects the whole compound height after signed feet in %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
      expect(parseMeasurement(raw, { type: 'height' })).toBeNull();
    }
  );

  it.each(['150 - 180 lbs', '150- 180 lbs', '150–180 lbs', 'kg 50 — 70', '.5 – .7 kg'])(
    'rejects spaced and Unicode numeric ranges in %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );

  it.each(['record 1-2; kg 70', 'record 2026-09-26; kg 70', 'record 1–2; kg 70'])(
    'ignores unrelated ranges before unit-prefix values in %s',
    raw => {
      expect(parseMeasurement(raw)?.value).toBe(70);
      expect(parseMeasurement(raw)?.unit).toBe('kg');
    }
  );

  it('retains a valid weight after a rejected signed compound height', () => {
    expect(parseMeasurement('-5\'-11", 180 lbs', { normalizedUnit: 'lb' })?.value).toBe(180);
  });

  it.each(['foots-5', 'poundz-150', 'meterz-1.5'])(
    'preserves signs after fuzzy unit prefixes in %s',
    raw => {
      expect(parseMeasurement(raw, { fuzziness: 1 })).toBeNull();
    }
  );

  it('retains fuzzy units inside a positive hyphenated height', () => {
    expect(parseMeasurement('5-foots-11', { fuzziness: 1 })?.value).toBe(71);
  });

  it.each(['5-.5', '5-0.5'])('accepts equivalent decimal inch components in %s', raw => {
    expect(parseMeasurement(raw, { type: 'height' })?.value).toBe(60.5);
    expect(parseMeasurement(raw, { type: 'height' })?.unit).toBe('in');
    expect(parseMeasurement(raw)).toBeNull();
  });

  it.each(['5-foot-.5', '5-foot-.5-inches', '5\'-.5"', "5'.5"])(
    'retains leading-dot inches in unit-delimited heights such as %s',
    raw => {
      expect(parseMeasurement(raw)?.value).toBe(60.5);
      expect(parseMeasurement(raw)?.unit).toBe('in');
    }
  );

  it.each(['"-.5 ft"', "'-.5 feet'", '-5\'-.5"'])(
    'preserves rejection of signed leading-dot quoted values in %s',
    raw => {
      expect(parseMeasurement(raw)).toBeNull();
    }
  );
});
