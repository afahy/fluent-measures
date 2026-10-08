import { describe, it, expect } from 'vitest';
import { parseMeasurement } from '../src';
import { tokenize } from '../src/tokenize';

describe('decimal commas without a leading zero', () => {
  it.each([',5 kg', ',5kg', 'kg ,5', '(,5) kg', 'kg;,5'])(
    'preserves the fractional value in %s',
    raw => {
      expect(parseMeasurement(raw)).toEqual({
        value: 0.5,
        unit: 'kg',
        type: 'weight',
        raw,
        matches: [{ value: 0.5, unit: 'kg' }],
      });
    }
  );

  it('keeps both decimal digits', () => {
    expect(parseMeasurement(',05kg')?.value).toBe(0.05);
    expect(tokenize(',05kg').map(({ text }) => text)).toEqual(['.05', 'kg']);
  });

  it.each(['5 ft ,5 in', '5-foot-,5-inches', "5',5"])('preserves fractional inches in %s', raw => {
    expect(parseMeasurement(raw)).toEqual({
      value: 60.5,
      unit: 'in',
      type: 'height',
      raw,
      matches: [
        { value: 5, unit: 'ft' },
        { value: 0.5, unit: 'in' },
      ],
    });
  });

  it('accepts a comma fraction in bare height shorthand', () => {
    expect(parseMeasurement('5-,5', { type: 'height' })?.value).toBe(60.5);
  });

  it('infers a unit for an unqualified comma fraction', () => {
    expect(
      parseMeasurement(',5', { type: 'weight', allowUnqualified: true, inferUnit: 'metric' })
    ).toMatchObject({ value: 0.5, unit: 'kg', raw: ',5' });
  });

  it('includes comma fractions in written number phrases', () => {
    expect(parseMeasurement(',5 hundred pounds')?.value).toBe(50);
  });

  it.each(['-,5 kg', 'kg-,5', '"-,5 ft"', '5--,5'])('keeps signed inputs invalid in %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it.each([',5-,7 kg', 'kg ,5 – ,7', ',5-1,5 kg'])('rejects the complete range in %s', raw => {
    expect(parseMeasurement(raw)).toBeNull();
  });

  it.each(['weight,5 kg', 'KG,5', 'weight_,5 kg'])(
    'keeps a comma after a word as punctuation in %s',
    raw => {
      expect(parseMeasurement(raw)?.value).toBe(5);
    }
  );
});
