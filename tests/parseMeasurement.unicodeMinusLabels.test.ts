// AFA-250 approved policy revision of main c670d12. Original inputs, assertions and
// AFA-202/247/248 rationale are archived in main-migration-preparation/main-original.
// Historical comments below describe the earlier contract; the migrated null cases
// reject the whole entry under the rule named by their test and exact ledger row.
import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';

// AFA-202: a comma separates the numeric label from the negative measurement.
// The same normalization guard must respect a semicolon after a numeric label too.
// Expected rejections follow the ticket and the negative-number rule; preservation values
// follow PARSING.md's numbers, ranges and multipart rules, with 5 * 12 + 11 = 71 inches.
describe('Unicode minus signs after numeric labels', () => {
  describe.each(['−', '﹣'])('minus %s', sign => {
    it.each([
      ['phase twenty, SIGN5 cm', {}],
      ['phase 20, SIGN5 cm', {}],
      ['phase twenty, SIGN5 cm', { type: 'height' }],
      ['phase 20, SIGN5 cm', { normalizedUnit: 'in' }],
      ['phase twenty, SIGN5 cm', { type: 'height', allowUnqualified: true }],
      ['phase twenty,SIGN5 cm', {}],
      ['phase twenty  , SIGN5 cm', {}],
      ['phase twenty; SIGN5 cm', {}],
      ['phase 20; SIGN5 cm', {}],
      // AFA-80's merged decision explicitly keeps '-0 kg, 70 kg' null: -0 counts as signed.
      ['phase 20, SIGN0 kg, 80 lb', { type: 'weight' }],
      ['phase20,SIGN5 cm', {}],
      ['phase ２０， SIGN５ ㎝', {}],
      ['PHASE TWENTY, SIGNFIVE CENTIMETERS', {}],
      ['phase twenty, SIGN.5 m', {}],
      ['phase 20, SIGN,5 kg', {}],
      ['phase twenty, SIGN72,5 kg', { type: 'weight' }],
      ['phase 20, SIGN1,000 lbs', { normalizedUnit: 'kg' }],
      ['phase twenty, SIGN½ lb', {}],
      ['phase 20, SIGN1/2 lb', { type: 'weight' }],
      ['phase twenty, SIGNfive feet', {}],
      ['phase 20, SIGNa hundred pounds', { type: 'weight' }],
      ['phase twenty, weight SIGN70kg', {}],
      ['phase 20, kg: SIGN70', { type: 'weight' }],
      ['phase 20, SIGN185#', { type: 'weight' }],
      ['phase twenty, SIGN5′11″', { type: 'height' }],
      ['phase twenty, SIGN5 foots', { fuzziness: 2 }],
    ] as const)('rejects the signed field in %s with %o', (input, options) => {
      const raw = input.replace('SIGN', sign);
      expect(parseMeasurement(raw, options)).toBeNull();
    });

    it.each(['phase 20, SIGN5 cm; actual 6 cm', 'phase twenty, SIGN5 cm; actual 6 cm'] as const)(
      'rejects %s under AFA-250: prose',
      input => {
        expect(parseMeasurement(input.replace('SIGN', sign))).toBeNull();
      }
    );

    it.each([
      ['5 ft SIGN11 in', {}, 71, 'in'],
      ['ft 5, SIGN11 in', {}, 71, 'in'],
      ['ft: 5, SIGN11 in', { type: 'height' }, 71, 'in'],
      ['m: 1, SIGN80 cm', { type: 'height' }, 180, 'cm'],
      ['ft five, SIGNeleven in', {}, 71, 'in'],
      ['(ft) 5, SIGN11 in', {}, 71, 'in'],
      ['(ft.) 5, SIGN11 in', {}, 71, 'in'],
      ['ft. 5, SIGN11 in', {}, 71, 'in'],
      ['(m.) 1, SIGN80 cm', {}, 180, 'cm'],
      ['m: one, SIGNeighty cm', {}, 180, 'cm'],
      ['5 ft, SIGN11 in', {}, 71, 'in'],
      ['1 m,SIGN80 cm', {}, 180, 'cm'],
    ] as const)('preserves joining context in %s with %o', (input, options, value, unit) => {
      expect(parseMeasurement(input.replace('SIGN', sign), options)).toMatchObject({ value, unit });
    });

    it.each([
      ['m: 1,8, SIGN180 cm', {}],
      ['m: 1,8; SIGN180 cm', { type: 'height' }],
      ['m: 1.8, SIGN180 cm', {}],
      ['m: ,5, SIGN50 cm', {}],
      ['kg: 1,000, SIGN1000 kg', { type: 'weight' }],
      ['kg: 1,000,5, SIGN1000.5 kg', {}],
      ['ft: 5,5, SIGN66 in', {}],
      ['in. 72, SIGN6 ft', {}],
      ['feet one hundred, SIGN1200 in', {}],
      ['ft: five and a half, SIGN66 in', {}],
    ] as const)('rejects %s under AFA-250: duplicate', (input, options) => {
      expect(parseMeasurement(input.replace('SIGN', sign), options)).toBeNull();
    });

    it.each([
      ['5;ft SIGN11 in', {}],
      ['ft;5, SIGN11 in', {}],
      ['5;feet SIGNeleven in', {}],
    ] as const)('rejects %s under AFA-250: semicolon', (input, options) => {
      expect(parseMeasurement(input.replace('SIGN', sign), options)).toBeNull();
    });

    it.each([
      ['5, ft SIGN11 in', {}],
      ['ft,5, SIGN11 in', {}],
      ['ft/5, SIGN11 in', {}],
      ['ft!5, SIGN11 in', {}],
      ['ft & 5, SIGN11 in', {}],
      ['ft {5}, SIGN11 in', {}],
    ] as const)('rejects %s under AFA-250: label-punctuation', (input, options) => {
      expect(parseMeasurement(input.replace('SIGN', sign), options)).toBeNull();
    });

    it.each([
      ['180 cm,SIGN70 kg', { type: 'weight' }],
      ['180 cmSIGN70 kg', { type: 'weight' }],
    ] as const)('rejects %s under AFA-250: signed', (input, options) => {
      expect(parseMeasurement(input.replace('SIGN', sign), options)).toBeNull();
    });

    it.each([
      ['phase 20, 5 ft, SIGN11 in', {}],
      ['phase 20, 5 ft SIGN11 in', {}],
      ['phase twenty, five ft SIGNeleven in', { type: 'height' }],
      ['phase 20, 1 mSIGN80 cm', {}],
      ['phase twenty, one mSIGN80 cm', {}],
      ['phase 20, 180 cmSIGN70 kg', { type: 'weight' }],
      ['phase 20, 72,5 kgSIGN72.5 kg', {}],
      ['phase 20, 1,000 lbsSIGN1000 lbs', {}],
      ['phase twenty, ½ lbSIGN0.5 lb', {}],
    ] as const)('rejects %s under AFA-250: prose', (input, options) => {
      expect(parseMeasurement(input.replace('SIGN', sign), options)).toBeNull();
    });

    it.each([
      '150 lbsSIGN180 lbs',
      '150 SIGN 180 lbs',
      'phase 20, 150SIGN180 lbs',
      'phase twenty, 150 lbsSIGN180 lbs',
      'phase 20, 72,5SIGN80,5 kg',
      'phase 20, 1,250SIGN1,500 lbs',
      'phase twenty, 5/2SIGN180 lbs',
      'kg 50SIGN70',
    ])('preserves range rejection in %s', input => {
      expect(parseMeasurement(input.replace('SIGN', sign))).toBeNull();
    });
  });

  it.each([
    'phase twenty, -5 cm',
    'phase twenty, －5 cm',
    '−5 ft',
    'kg−70.5',
    'phase 20, -0 kg, 80 lb',
    '−0 kg, 80 lb',
    // Exact AFA-80 merged decisions and their Unicode forms, independent of label handling.
    '-0 kg, 70 kg',
    '−0 kg, 70 kg',
    '﹣0 kg, 70 kg',
    '-0 feet, actual 1.8 meters',
    '−0 feet, actual 1.8 meters',
    '﹣0 feet, actual 1.8 meters',
  ])('preserves the existing sign rejection for %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it.each([
    ['phase twenty, 5 cm', {}],
    ['phase twenty, “5” cm', {}],
    ['phase 20, 5 cm', {}],
    ['phase twenty, five cm', {}],
    ['phase twenty five cm', {}],
    ['phase 2,180 cm', {}],
    ['phase20,180 cm', {}],
  ] as const)('rejects %s under AFA-250: prose', (raw, options) => {
    expect(parseMeasurement(raw, options)).toBeNull();
  });

  it.each([
    ['5 ft (1/2 lbs)', { type: 'weight' }, 0.5, 'lb'],
    ['5 ft, 10/180 lbs', { type: 'weight' }, 0.05555555555555555, 'lb'],
  ] as const)('preserves %s with %o', (raw, options, value, unit) => {
    expect(parseMeasurement(raw, options)).toMatchObject({ value, unit });
  });

  it('preserves both metric parts', () => {
    expect(parseMeasurement('1 m−80 cm')?.matches).toEqual([
      { value: 1, unit: 'm' },
      { value: 80, unit: 'cm' },
    ]);
  });
});
