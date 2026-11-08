import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions } from '../src';

// AFA-251: source units are caller-supplied, never inferred from the output unit or magnitude.
// Expectations use identity, 100 cm/m, 2.54 cm/in, and 0.45359237 kg/lb independently.
describe('explicit source-unit defaults', () => {
  it.each([
    ['80', { defaultUnit: 'kg' }, 80, 'kg', 'weight', 'kg'],
    ['80', { defaultUnit: 'lb', normalizedUnit: 'kg' }, 36.2873896, 'kg', 'weight', 'lb'],
    ['72', { defaultUnit: 'in', normalizedUnit: 'cm' }, 182.88, 'cm', 'height', 'in'],
    ['6', { defaultUnit: 'ft', normalizedUnit: 'cm' }, 182.88, 'cm', 'height', 'ft'],
    ['1.8', { defaultUnit: 'cm' }, 1.8, 'cm', 'height', 'cm'],
    ['1.8', { defaultUnit: 'm', normalizedUnit: 'cm' }, 180, 'cm', 'height', 'm'],
    ['2.99', { defaultUnit: 'm', normalizedUnit: 'cm' }, 299, 'cm', 'height', 'm'],
    ['3', { defaultUnit: 'm', normalizedUnit: 'cm' }, 300, 'cm', 'height', 'm'],
    ['2.99', { defaultUnit: 'cm' }, 2.99, 'cm', 'height', 'cm'],
    ['3', { defaultUnit: 'cm' }, 3, 'cm', 'height', 'cm'],
    [' 80 ', { type: 'weight', defaultUnit: 'kg' }, 80, 'kg', 'weight', 'kg'],
  ] as const)('reads %s with %o', (raw, options, expected, unit, type, sourceUnit) => {
    const result = parseMeasurement(raw, options);
    expect(result).toMatchObject({ unit, type, raw, matches: [{ unit: sourceUnit }] });
    expect(result?.value).toBeCloseTo(expected, 10);
  });

  it.each([
    ['80 kg', { defaultUnit: 'lb', normalizedUnit: 'kg' }, 80, 'kg'],
    ['80 kg', { defaultUnit: 'cm' }, 80, 'kg'],
    ['180 cm', { defaultUnit: 'kg' }, 180, 'cm'],
    ['five foot ten', { defaultUnit: 'cm' }, 70, 'in'],
    ['5-11', { type: 'height', defaultUnit: 'cm' }, 71, 'in'],
  ] as const)('keeps the written or shorthand units in %s', (raw, options, value, unit) => {
    expect(parseMeasurement(raw, options)).toMatchObject({ value, unit });
  });

  it.each([{}, { type: 'weight' }, { normalizedUnit: 'kg' }, { defaultUnit: undefined }] as const)(
    'does not assign a source unit from %o',
    options => {
      expect(parseMeasurement('80', options)).toBeNull();
    }
  );

  it.each(['0', '-80', '80 giraffes', '80 90', 'about 80', '(80)', '80;', ';80', '80,'])(
    'does not default a fragment of %s',
    raw => {
      expect(parseMeasurement(raw, { defaultUnit: 'kg' })).toBeNull();
    }
  );

  it.each(['cm', 'm'] as const)('does not infer bare shorthand from default %s', defaultUnit => {
    expect(parseMeasurement('5-11', { defaultUnit })).toBeNull();
  });

  it.each([
    ['72,5', 72.5],
    ['5½', 5.5],
    ['one hundred fifty', 150],
  ] as const)('uses the existing complete-number reader for %s', (raw, value) => {
    expect(parseMeasurement(raw, { defaultUnit: 'kg' })).toEqual({
      value,
      unit: 'kg',
      type: 'weight',
      matches: [{ value, unit: 'kg' }],
      raw,
    });
  });
});

describe('source-default configuration errors', () => {
  it.each([
    { type: 'height', defaultUnit: 'kg' },
    { type: 'weight', defaultUnit: 'cm' },
    { defaultUnit: 'cm', normalizedUnit: 'kg' },
    { type: 'weight', defaultUnit: 'in', normalizedUnit: 'kg' },
  ] as const)('rejects incompatible options %o even for explicit input', options => {
    expect(() => parseMeasurement('80 kg', options)).toThrow(
      'defaultUnit must match the requested measurement type'
    );
  });

  it.each([null, '', 'KG', 'lbs', 'stone', 0, -1, NaN, true, {}, Symbol('private')])(
    'rejects invalid source unit %s',
    defaultUnit => {
      expect(() => parseMeasurement('80 kg', { defaultUnit } as ParseOptions)).toThrow(
        new TypeError('defaultUnit must be ft, in, cm, m, lb or kg')
      );
    }
  );

  it.each(['allowUnqualified', 'inferUnit'] as const)('rejects retired option %s', key => {
    const options = { [key]: false } as ParseOptions;
    expect(() => parseMeasurement('80 kg', options)).toThrow(`${key} was removed; use defaultUnit`);
  });

  it('treats undefined retired options as absent', () => {
    const options = {
      defaultUnit: 'kg',
      allowUnqualified: undefined,
      inferUnit: undefined,
    } as const;
    expect(parseMeasurement('80', options)).toMatchObject({ value: 80, unit: 'kg' });
  });

  it.each(['', '1234,567 kg', 'x'.repeat(1001)])(
    'validates options before string content or length: %s',
    raw => {
      expect(() => parseMeasurement(raw, { defaultUnit: 'cm', normalizedUnit: 'kg' })).toThrow(
        'defaultUnit must match the requested measurement type'
      );
    }
  );

  it.each(['', '0 in', '6 ft', 'x'.repeat(1001)])('validates existing options for %s', raw => {
    expect(() =>
      parseMeasurement(raw, { normalizedUnit: 'st' } as unknown as ParseOptions)
    ).toThrow(new TypeError('normalizedUnit must be ft, in, cm, m, lb or kg'));
    expect(() => parseMeasurement(raw, { type: 'other' } as unknown as ParseOptions)).toThrow(
      new TypeError('type must be height or weight')
    );
  });

  it.each([null, false, 1, 'kg', []])('rejects invalid options container %s', options => {
    expect(() => parseMeasurement('', options as ParseOptions)).toThrow(
      new TypeError('options must be an object')
    );
  });

  // Approved AFA-178 / AFA-251 ordering, independently of the parser's helper layout.
  it.each([
    [{ maxLength: 0, type: 'other' }, 'maxLength must be a number of at least 1'],
    [{ type: 'other', normalizedUnit: 'st' }, 'type must be height or weight'],
    [
      { normalizedUnit: 'st', defaultUnit: 'lbs' },
      'normalizedUnit must be ft, in, cm, m, lb or kg',
    ],
    [{ defaultUnit: 'lbs', allowUnqualified: true }, 'defaultUnit must be ft, in, cm, m, lb or kg'],
    [
      { allowUnqualified: false, type: 'height', normalizedUnit: 'kg' },
      'allowUnqualified was removed; use defaultUnit',
    ],
    [
      { type: 'height', normalizedUnit: 'kg', defaultUnit: 'lb' },
      'normalizedUnit kg is not a height unit',
    ],
  ])('reports the first option error in %o', (options, message) => {
    expect(() => parseMeasurement('', options as ParseOptions)).toThrow(message);
  });

  it('keeps empty runtime type and output-unit values as absence', () => {
    const options = { type: '', normalizedUnit: '', defaultUnit: 'kg' } as unknown as ParseOptions;
    expect(parseMeasurement('80', options)).toMatchObject({ value: 80, unit: 'kg' });
  });
});
