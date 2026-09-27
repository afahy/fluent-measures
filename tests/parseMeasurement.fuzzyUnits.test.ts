import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

describe('conservative fuzzy unit matching', () => {
  it.each([
    ['i was 180', 2],
    ['I ate 5 food', 1],
    ['6 abs', 1],
    ['5 feel', 1],
  ])('does not interpret ordinary prose as a unit in %s', (raw, fuzziness) => {
    expect(parseMeasurement(raw, { fuzziness })).toBeNull();
  });

  it.each(['80 kilo', '80 kilos', '80 KILO'])('recognizes %s without fuzziness', raw => {
    expect(parseMeasurement(raw)).toEqual({
      value: 80,
      unit: 'kg',
      type: 'weight',
      raw,
      matches: [{ value: 80, unit: 'kg' }],
    });
  });

  it('keeps the documented fuzzy compound height', () => {
    const raw = '5 foots 10 inc';
    expect(parseMeasurement(raw, { fuzziness: 2 })).toEqual({
      value: 70,
      unit: 'in',
      type: 'height',
      raw,
      matches: [
        { value: 5, unit: 'ft' },
        { value: 10, unit: 'in' },
      ],
    });
  });

  it('finds a real measurement after unrelated prose', () => {
    const raw = 'I ate 5 food; weight 80 kilo';
    expect(parseMeasurement(raw, { fuzziness: 2 })).toEqual({
      value: 80,
      unit: 'kg',
      type: 'weight',
      raw,
      matches: [{ value: 80, unit: 'kg' }],
    });
  });
});
