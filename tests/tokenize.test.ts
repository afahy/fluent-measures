import { describe, it, expect } from 'vitest';
import { tokenize } from '../src/tokenize';

describe('tokenize', () => {
  it('handles simple space-separated tokens', () => {
    expect(tokenize('180 lbs')).toEqual(['180', 'lbs']);
    expect(tokenize('six feet')).toEqual(['six', 'feet']);
  });

  it('converts input to lowercase', () => {
    expect(tokenize('HELLO WORLD')).toEqual(['hello', 'world']);
    expect(tokenize('FiVe FeEt')).toEqual(['five', 'feet']);
  });

  it('handles foot and inch marks attached to numbers', () => {
    expect(tokenize('5\' 11"')).toEqual(['5', "'", '11', '"']);
    expect(tokenize('5\'11"')).toEqual(['5', "'", '11', '"']);
  });

  it('handles letter-based units attached to numbers', () => {
    expect(tokenize('180cm')).toEqual(['180', 'cm']);
    expect(tokenize('72.5kg')).toEqual(['72.5', 'kg']);
  });

  it('preserves decimal points in numbers', () => {
    expect(tokenize('72.5 kg')).toEqual(['72.5', 'kg']);
    expect(tokenize('5.11 meters')).toEqual(['5.11', 'meters']);
  });

  it.each([
    ['72,5 kg', ['72.5', 'kg']],
    ['72,05kg', ['72.05', 'kg']],
    ['1,000 lbs', ['1000', 'lbs']],
    ['1,000,000 lbs', ['1000000', 'lbs']],
    ['12,345,678.9 lbs', ['12345678.9', 'lbs']],
    ['-72,5 kg', ['-72.5', 'kg']],
    ['-1,000 lbs', ['-1000', 'lbs']],
  ])('normalizes numeric commas in %s', (input, expected) => {
    expect(tokenize(input)).toEqual(expected);
  });

  it.each([
    ['weight, 72 kg', ['weight', '72', 'kg']],
    ['72, kg', ['72', 'kg']],
    ['72, 5 kg', ['72', '5', 'kg']],
    ['72 kg,180 cm', ['72', 'kg', '180', 'cm']],
    ['1,2345 lbs', ['1', '2345', 'lbs']],
  ])('keeps other commas as separators in %s', (input, expected) => {
    expect(tokenize(input)).toEqual(expected);
  });

  it('handles unit abbreviations with periods', () => {
    expect(tokenize('180 lb.')).toEqual(['180', 'lb']);
    expect(tokenize('72.5 kg.')).toEqual(['72.5', 'kg']);
  });

  it('preserves minus signs in numbers', () => {
    expect(tokenize('-5 feet')).toEqual(['-5', 'feet']);
    expect(tokenize('-72.5 kg')).toEqual(['-72.5', 'kg']);
  });

  it.each([
    ['5-11', ['5', '11']],
    ['5-foot-11', ['5', 'foot', '11']],
    ['5-foot-11.5', ['5', 'foot', '11.5']],
    ['height-5feet', ['height', '5', 'feet']],
  ])('splits separator hyphens in %s', (input, expected) => {
    expect(tokenize(input)).toEqual(expected);
  });

  it.each([
    ['height -5feet', ['height', '-5', 'feet']],
    ['height\t-5.5ft', ['height', '-5.5', 'ft']],
    ['height\n-5ft', ['height', '-5', 'ft']],
  ])('preserves a minus sign after whitespace in %s', (input, expected) => {
    expect(tokenize(input)).toEqual(expected);
  });

  it('handles multiple whitespace characters', () => {
    expect(tokenize('5    11')).toEqual(['5', '11']);
    expect(tokenize('  180  lbs  ')).toEqual(['180', 'lbs']);
    expect(tokenize('5\'   11"')).toEqual(['5', "'", '11', '"']);
  });

  it('filters out empty tokens', () => {
    expect(tokenize('  ')).toEqual([]);
    expect(tokenize('')).toEqual([]);
  });

  it('removes other special characters', () => {
    expect(tokenize('180@lbs')).toEqual(['180', 'lbs']);
    expect(tokenize('five&feet')).toEqual(['five', 'feet']);
    expect(tokenize('72.5!kg')).toEqual(['72.5', 'kg']);
  });

  it('handles complex mixed inputs', () => {
    expect(tokenize('5\'11" tall')).toEqual(['5', "'", '11', '"', 'tall']);
    expect(tokenize('72.5kg.')).toEqual(['72.5', 'kg']);
    expect(tokenize('Six-Foot-Two')).toEqual(['six', 'foot', 'two']);
  });
});
