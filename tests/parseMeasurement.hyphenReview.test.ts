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
});
