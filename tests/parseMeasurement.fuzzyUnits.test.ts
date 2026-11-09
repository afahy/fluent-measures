// AFA-250: recovery expectations now follow the approved complete-entry contract in PARSING.md.
// Earlier ticket rationales below describe their historical extraction contract; original
// assertions are retained separately under design/afa-250.
import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions } from '../src';

describe('conservative fuzzy unit matching', () => {
  // The words around the measurement still make these entries null with fuzzy.
  it.each(['i was 180', 'I ate 5 food', '6 abs'])(
    'does not interpret ordinary prose as a unit in %s',
    raw => {
      expect(parseMeasurement(raw, { fuzzy: true })).toBeNull();
    }
  );

  // AFA-253 comment d5897102: there is no blocked list. With fuzzy, an English word one edit from a
  // unit name reads as that unit: "feel" is one from "feet", and "kill" and "kills" one from
  // "kilo" and "kilos". Main blocked these words at any fuzziness.
  it.each([
    ['5 feel', 5, 'ft'],
    ['kill 5', 5, 'kg'],
    ['5 kills', 5, 'kg'],
  ] as const)('reads the English word in %s with fuzzy only', (raw, value, unit) => {
    expect(parseMeasurement(raw, { fuzzy: true })).toMatchObject({ value, unit });
    expect(parseMeasurement(raw)).toBeNull();
  });

  it.each(['80 kilo', '80 kilos', '80 KILO'])('recognizes %s without fuzzy', raw => {
    expect(parseMeasurement(raw)).toEqual({
      value: 80,
      unit: 'kg',
      type: 'weight',
      raw,
      matches: [{ value: 80, unit: 'kg' }],
    });
  });

  // README and PARSING.md: "foots" and "inc" are each one edit from "foot" and "inch".
  it('keeps the documented fuzzy compound height', () => {
    const raw = '5 foots 10 inc';
    expect(parseMeasurement(raw, { fuzzy: true })).toEqual({
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

  // PARSING.md gives null for "5 foots 10 inc" without fuzzy.
  it.each([false, undefined])('reads no typos with fuzzy %s', fuzzy => {
    expect(parseMeasurement('70 kilgrm', { fuzzy })).toBeNull();
    expect(parseMeasurement('5 foots 10 inc', { fuzzy })).toBeNull();
  });

  // AFA-253: fuzzy reads one edit, and the reviewed typos in PARSING.md. "kilgrm" is two edits
  // from "kilogram" (insert o and a), and it is on that list, so it reads as kg, as main's
  // fuzziness 2 did. "kilgrom" is two edits too and isn't on the list.
  it('reads 70 kilgrm from the typo list, but not another two-edit typo', () => {
    expect(parseMeasurement('70 kilgrm', { fuzzy: true })).toEqual({
      value: 70,
      unit: 'kg',
      type: 'weight',
      raw: '70 kilgrm',
      matches: [{ value: 70, unit: 'kg' }],
    });
    expect(parseMeasurement('70 kilgrom', { fuzzy: true })).toBeNull();
  });

  // AFA-253: the maintainer's example. "ponds" is one edit from "pounds".
  it('reads 150 ponds as 150 lb', () => {
    expect(parseMeasurement('150 ponds', { fuzzy: true })).toEqual({
      value: 150,
      unit: 'lb',
      type: 'weight',
      raw: '150 ponds',
      matches: [{ value: 150, unit: 'lb' }],
    });
    expect(parseMeasurement('150 ponds')).toBeNull();
  });

  it('rejects unrelated prose even with fuzzy matching', () => {
    const raw = 'I ate 5 food; weight 80 kilo';
    expect(parseMeasurement(raw, { fuzzy: true })).toBeNull();
  });
});

// AFA-253 (comment 226d15f6): fuzzy is true or false, and fuzziness is retired like
// allowUnqualified and inferUnit (AFA-251).
describe('the fuzzy option and the retired fuzziness', () => {
  it.each([1, 0, 'true', null, {}, [true]])('rejects fuzzy %o', fuzzy => {
    expect.assertions(6);
    const options = { fuzzy } as unknown as ParseOptions;
    for (const raw of ['', '70 kg', 'x'.repeat(1001)]) {
      expect(() => parseMeasurement(raw, options)).toThrow(TypeError);
      expect(() => parseMeasurement(raw, options)).toThrow(/fuzzy/);
    }
  });

  // Every value that main accepted, including those that turned fuzzy matching off.
  it.each([1, 2, 0, 0.5, 1.5, -1, Infinity, -Infinity, NaN, false, null, '2'])(
    'rejects the retired fuzziness %o with its replacement',
    fuzziness => {
      expect.assertions(8);
      const options = { fuzziness } as unknown as ParseOptions;
      for (const raw of ['', '70 kg', '5 foots 10 inc', 'x'.repeat(1001)]) {
        expect(() => parseMeasurement(raw, options)).toThrow(Error);
        // A fuzziness of 0 turned matching off, so the message also says to remove it.
        expect(() => parseMeasurement(raw, options)).toThrow(
          'fuzziness was removed; use fuzzy: true or remove it'
        );
      }
    }
  );

  it('treats an undefined fuzziness as absent', () => {
    const options = { fuzziness: undefined, fuzzy: true } as unknown as ParseOptions;
    expect(parseMeasurement('150 ponds', options)).toMatchObject({ value: 150, unit: 'lb' });
  });

  // README: the checks run in the order type, normalizedUnit, defaultUnit, fuzzy, retired options,
  // then dimension conflicts.
  it('checks fuzzy after defaultUnit and before the retired options', () => {
    expect(() =>
      parseMeasurement('70 kg', { defaultUnit: 'st', fuzzy: 1 } as unknown as ParseOptions)
    ).toThrow(/defaultUnit/);
    expect(() =>
      parseMeasurement('70 kg', { fuzzy: 1, fuzziness: 1 } as unknown as ParseOptions)
    ).toThrow(/^fuzzy must/);
    expect(() =>
      parseMeasurement('70 kg', {
        fuzziness: 1,
        type: 'height',
        normalizedUnit: 'kg',
      } as unknown as ParseOptions)
    ).toThrow(/fuzziness/);
  });

  it('returns null for non-string input before reading fuzzy', () => {
    const options = { fuzzy: 1, fuzziness: 2 } as unknown as ParseOptions;
    expect(parseMeasurement(70 as unknown as string, options)).toBeNull();
  });
});
