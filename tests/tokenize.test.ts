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

  it('handles unit abbreviations with periods', () => {
    expect(tokenize('180 lb.')).toEqual(['180', 'lb']);
    expect(tokenize('72.5 kg.')).toEqual(['72.5', 'kg']);
  });

  it('preserves minus signs in numbers', () => {
    expect(tokenize('-5 feet')).toEqual(['-5', 'feet']);
    expect(tokenize('-72.5 kg')).toEqual(['-72.5', 'kg']);
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
