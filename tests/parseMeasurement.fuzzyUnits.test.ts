// AFA-250: recovery expectations now follow the approved complete-entry contract in PARSING.md.
// Earlier ticket rationales below describe their historical extraction contract; original
// assertions are retained separately under design/afa-250.
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

  it.each(['kill 5', '5 kills'])('does not interpret %s as kilograms', raw => {
    expect(parseMeasurement(raw, { fuzziness: 1 })).toBeNull();
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

  // AFA-189: a fuzziness that isn't a finite number above 0 turns fuzzy matching off. PARSING.md
  // gives null for "5 foots 10 inc" without fuzziness.
  it.each([Infinity, -Infinity, 0, NaN, -1])('reads no typos with fuzziness %s', fuzziness => {
    expect(parseMeasurement('70 kilgrm', { fuzziness })).toBeNull();
    expect(parseMeasurement('5 foots 10 inc', { fuzziness })).toBeNull();
  });

  // "kilgrm" is two edits from "kilogram", so a fuzziness of 2 still reads it.
  it('reads 70 kilgrm with fuzziness 2', () => {
    expect(parseMeasurement('70 kilgrm', { fuzziness: 2 })).toEqual({
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '70 kilgrm',
      matches: [{ value: 70, unit: 'kg' }],
    });
  });

  // A fraction is finite and above 0, so it keeps its result. "foots" and "inc" are each one edit
  // from "foot" and "inch".
  it('reads 5 foots 10 inc with fuzziness 1.5 but not 0.5', () => {
    const raw = '5 foots 10 inc';
    expect(parseMeasurement(raw, { fuzziness: 1.5 })).toEqual({
      value: 70,
      unit: 'in',
      type: 'height',
      raw,
      matches: [
        { value: 5, unit: 'ft' },
        { value: 10, unit: 'in' },
      ],
    });
    expect(parseMeasurement(raw, { fuzziness: 0.5 })).toBeNull();
  });

  it('rejects unrelated prose even with fuzzy matching', () => {
    const raw = 'I ate 5 food; weight 80 kilo';
    expect(parseMeasurement(raw, { fuzziness: 2 })).toBeNull();
  });
});
