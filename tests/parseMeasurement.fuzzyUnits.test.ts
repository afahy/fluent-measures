import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions } from '../src';

// AFA-253 intentionally overrides AFA-216's fuzzy success. Unknown text beside a valid
// measurement depends on AFA-250's shared complete-entry boundary, not suffix extraction.
// Literal aliases and quantities come from approval and hand calculation (100 cm/m,
// 12 in/ft, 2.54 cm/in, 0.45359237 kg/lb), never from parser output.
describe('exact aliases without automatic corrections', () => {
  it.each([
    ['80 kilo', {}, 80, 'kg', 'weight', [[80, 'kg']]],
    ['80 kilos', {}, 80, 'kg', 'weight', [[80, 'kg']]],
    ['80 KILO', {}, 80, 'kg', 'weight', [[80, 'kg']]],
    ['95 kilogramme', {}, 95, 'kg', 'weight', [[95, 'kg']]],
    ['95 kilogrammes', {}, 95, 'kg', 'weight', [[95, 'kg']]],
    ['95 KILOGRAMMES', {}, 95, 'kg', 'weight', [[95, 'kg']]],
    ['70.50 kilogrammes', {}, 70.5, 'kg', 'weight', [[70.5, 'kg']]],
    [
      '5 ft 10 in',
      {},
      70,
      'in',
      'height',
      [
        [5, 'ft'],
        [10, 'in'],
      ],
    ],
    [
      '5 foot 10 inches',
      {},
      70,
      'in',
      'height',
      [
        [5, 'ft'],
        [10, 'in'],
      ],
    ],
    ['1.8 metres', { normalizedUnit: 'cm' }, 180, 'cm', 'height', [[1.8, 'm']]],
    ['5.11 ft', { normalizedUnit: 'cm' }, 155.7528, 'cm', 'height', [[5.11, 'ft']]],
    ['180 lb', { normalizedUnit: 'kg' }, 81.6466266, 'kg', 'weight', [[180, 'lb']]],
    ['80', { defaultUnit: 'kg' }, 80, 'kg', 'weight', [[80, 'kg']]],
    ['95 kilogrammes', { defaultUnit: 'lb' }, 95, 'kg', 'weight', [[95, 'kg']]],
  ] as const)('reads exact %s', (raw, options, value, unit, type, parts) => {
    const result = parseMeasurement(raw, options);
    expect(result?.value).toBeCloseTo(value, 10);
    expect(result).toMatchObject({
      unit,
      type,
      raw,
      matches: parts.map(([value, unit]) => ({ value, unit })),
    });
    expect(Object.keys(result ?? {}).sort()).toEqual(['matches', 'raw', 'type', 'unit', 'value']);
  });
  it.each([
    ['i was 180', {}],
    ['I ate 5 food', {}],
    ['6 abs', {}],
    ['5 feel', {}],
    ['kill 5', {}],
    ['5 kills', {}],
    ['5 foots 10 inc', {}],
    ['70 kilgrm', {}],
    ['70.50 kilgrm', {}],
    ['180 pouds', {}],
    ['6 feat', {}],
    ['75 kilogams', {}],
    ['160 poonds', {}],
    ['170 centimeteres', {}],
    ['1.8 meterz', {}],
    ['72 inces', {}],
    ['80 killo', {}],
    ['6 fet', {}],
    ['foots-5', {}],
    ['poundz-150', {}],
    ['meterz-1.5', {}],
    ['and ft-5', {}],
    ['5-foots-11', {}],
    ['5 footz-11', {}],
    ['5 fet 10 inches', {}],
    ['5 foot 11 inc', {}],
    ['5 feet 11 inchs', {}],
    ['5 fot 9 in', {}],
    ['5 feett 11', {}],
    ['I paid 5 fees', {}],
    ['we visited 2 ponds', {}],
    ['the studio has 2 kilns', {}],
    ['I ate 5 food; weight 80 kilo', {}],
    ['phase twenty, 5 kilogams', {}],
    ['two, thirty poundz', {}],
    ['kg -6 foots, 70 kg', {}],
    ['150-180; poundz 70 kg', {}],
    ['poundz 70 1-2 ft 6 in', {}],
    ['150-180 poundz 70 kg', {}],
    ['poundz 150-180 70 kg', {}],
    ['80 kilgrm', { defaultUnit: 'kg' }],
    ['5 ft; 70 kilgrm', { type: 'height' }],
    ['5 foots 10 inc; 6 ft', { type: 'height' }],
    ['70.5.2 kilgrm', {}],
  ] as const)('rejects uncertain input %s', (raw, options) => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });

  // Defined values retire, even values that formerly disabled fuzziness. Undefined is absent.
  it.each([
    Infinity,
    -Infinity,
    NaN,
    0,
    -0,
    -1,
    -0.5,
    Number.MIN_VALUE,
    0.5,
    1 - Number.EPSILON,
    1,
    1.5,
    2 - Number.EPSILON,
    2,
    false,
    null,
    '2',
    {},
    [],
    Symbol('budget'),
  ])('rejects the retired option %s before parsing', fuzziness => {
    // Two checks for each of the five inputs.
    expect.assertions(10);
    const options = { fuzziness } as unknown as ParseOptions;
    for (const raw of ['', '70 kg', '70 kilgrm', '5 foots 10 inc', 'x'.repeat(1001)]) {
      expect(() => parseMeasurement(raw, options)).toThrow(Error);
      expect(() => parseMeasurement(raw, options)).toThrow(/fuzziness/);
    }
  });
  it('treats an explicitly undefined fuzziness as absent', () => {
    const options = { fuzziness: undefined } as unknown as ParseOptions;
    expect(parseMeasurement('95 kilogrammes', options)).toEqual({
      value: 95,
      unit: 'kg',
      type: 'weight',
      raw: '95 kilogrammes',
      matches: [{ value: 95, unit: 'kg' }],
    });
    expect(parseMeasurement('5 foots 10 inc', options)).toBeNull();
  });
  it('validates the source default before a retired fuzziness value', () => {
    const options = { defaultUnit: 'kilogrammes', fuzziness: 1 } as unknown as ParseOptions;
    expect(() => parseMeasurement('95 kilogrammes', options)).toThrow(TypeError);
    expect(() => parseMeasurement('95 kilogrammes', options)).toThrow(/defaultUnit/);
  });
  it.each([
    ['maxLength', { maxLength: 0 }],
    ['type', { type: false }],
    ['normalizedUnit', { normalizedUnit: 'st' }],
    ['allowUnqualified', { allowUnqualified: false }],
    ['inferUnit', { inferUnit: 'metric' }],
  ] as const)('validates %s before fuzziness', (name, earlier) => {
    const options = { ...earlier, fuzziness: 1 } as unknown as ParseOptions;
    expect(() => parseMeasurement('', options)).toThrow(Error);
    expect(() => parseMeasurement('', options)).toThrow(new RegExp(name));
  });
  it('returns null for non-string input before reading fuzziness', () => {
    const options = {
      get fuzziness(): never {
        throw new Error('read fuzziness');
      },
    } as unknown as ParseOptions;
    expect(parseMeasurement(null as unknown as string, options)).toBeNull();
  });
  it('validates retired fuzziness before dimension conflicts', () => {
    const options = {
      type: 'height',
      normalizedUnit: 'kg',
      fuzziness: 1,
    } as unknown as ParseOptions;
    expect(() => parseMeasurement('', options)).toThrow(Error);
    expect(() => parseMeasurement('', options)).toThrow(/fuzziness/);
  });
});
