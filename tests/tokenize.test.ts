import { describe, it, expect } from 'vitest';
import { tokenize } from '../src/tokenize';

// The text of each token.
const tokenTexts = (input: string): string[] => tokenize(input).map(({ text }) => text);

describe('tokenize', () => {
  it('handles simple space-separated tokens', () => {
    expect(tokenTexts('180 lbs')).toEqual(['180', 'lbs']);
    expect(tokenTexts('six feet')).toEqual(['six', 'feet']);
  });

  it('converts input to lowercase', () => {
    expect(tokenTexts('HELLO WORLD')).toEqual(['hello', 'world']);
    expect(tokenTexts('FiVe FeEt')).toEqual(['five', 'feet']);
  });

  it('handles foot and inch marks attached to numbers', () => {
    expect(tokenTexts('5\' 11"')).toEqual(['5', "'", '11', '"']);
    expect(tokenTexts('5\'11"')).toEqual(['5', "'", '11', '"']);
  });

  it('handles letter-based units attached to numbers', () => {
    expect(tokenTexts('180cm')).toEqual(['180', 'cm']);
    expect(tokenTexts('72.5kg')).toEqual(['72.5', 'kg']);
  });

  it('preserves decimal points in numbers', () => {
    expect(tokenTexts('72.5 kg')).toEqual(['72.5', 'kg']);
    expect(tokenTexts('5.11 meters')).toEqual(['5.11', 'meters']);
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
    expect(tokenTexts(input)).toEqual(expected);
  });

  it.each([
    ['weight, 72 kg', ['weight', '72', 'kg']],
    ['72, kg', ['72', 'kg']],
    ['72, 5 kg', ['72', '5', 'kg']],
    ['72 kg,180 cm', ['72', 'kg', '180', 'cm']],
    ['1,2345 lbs', ['1', '2345', 'lbs']],
  ])('keeps other commas as separators in %s', (input, expected) => {
    expect(tokenTexts(input)).toEqual(expected);
  });

  it('handles unit abbreviations with periods', () => {
    expect(tokenTexts('180 lb.')).toEqual(['180', 'lb']);
    expect(tokenTexts('72.5 kg.')).toEqual(['72.5', 'kg']);
  });

  it('preserves minus signs in numbers', () => {
    expect(tokenTexts('-5 feet')).toEqual(['-5', 'feet']);
    expect(tokenTexts('-72.5 kg')).toEqual(['-72.5', 'kg']);
  });

  it.each([
    ['5-11', ['5', '11']],
    ['5-foot-11', ['5', 'foot', '11']],
    ['5-foot-11.5', ['5', 'foot', '11.5']],
    ['height-5feet', ['height', '5', 'feet']],
  ])('splits separator hyphens in %s', (input, expected) => {
    expect(tokenTexts(input)).toEqual(expected);
  });

  it.each([
    ['height -5feet', ['height', '-5', 'feet']],
    ['height\t-5.5ft', ['height', '-5.5', 'ft']],
    ['height\n-5ft', ['height', '-5', 'ft']],
  ])('preserves a minus sign after whitespace in %s', (input, expected) => {
    expect(tokenTexts(input)).toEqual(expected);
  });

  it('handles multiple whitespace characters', () => {
    expect(tokenTexts('5    11')).toEqual(['5', '11']);
    expect(tokenTexts('  180  lbs  ')).toEqual(['180', 'lbs']);
    expect(tokenTexts('5\'   11"')).toEqual(['5', "'", '11', '"']);
  });

  it('filters out empty tokens', () => {
    expect(tokenTexts('  ')).toEqual([]);
    expect(tokenTexts('')).toEqual([]);
  });

  it('removes other special characters', () => {
    expect(tokenTexts('180@lbs')).toEqual(['180', 'lbs']);
    expect(tokenTexts('five&feet')).toEqual(['five', 'feet']);
    expect(tokenTexts('72.5!kg')).toEqual(['72.5', 'kg']);
  });

  it('handles complex mixed inputs', () => {
    expect(tokenTexts('5\'11" tall')).toEqual(['5', "'", '11', '"', 'tall']);
    expect(tokenTexts('72.5kg.')).toEqual(['72.5', 'kg']);
    expect(tokenTexts('Six-Foot-Two')).toEqual(['six', 'foot', 'two']);
  });

  // A label is one token, which gives its kind and whether it starts a field (AFA-87). A short
  // alias before ":" or "=" names a field and is spelled out. A label after a comma, semicolon,
  // colon, equals sign or "&" starts a field.
  it.each([
    ['(kg) 72', [{ text: 'kg', label: 'unit', startsField: false }, { text: '72' }]],
    [
      '72 in. tall',
      [{ text: '72' }, { text: 'inch', label: 'unit', startsField: false }, { text: 'tall' }],
    ],
    ['in: 72', [{ text: 'inch', label: 'name', startsField: false }, { text: '72' }]],
    [
      'age 28 (m): 1.8',
      [
        { text: 'age' },
        { text: '28' },
        { text: 'meter', label: 'name', startsField: false },
        { text: '1.8' },
      ],
    ],
    [
      'age=28, in=72',
      [
        { text: 'age' },
        { text: '28' },
        { text: 'inch', label: 'name', startsField: true },
        { text: '72' },
      ],
    ],
    [
      '72 kg; lb: 158',
      [
        { text: '72' },
        { text: 'kg' },
        { text: ';' },
        { text: 'lb', label: 'unit', startsField: true },
        { text: '158' },
      ],
    ],
  ])('gives the label its kind in %s', (input, expected) => {
    expect(tokenize(input)).toEqual(expected);
  });

  // The tokenizer marks labels in lowercase text, so no word of the input can mark one.
  it.each([
    ['NAME UNIT kg FIELD 5', ['name', 'unit', 'kg', 'field', '5']],
    ['5 _unit kg', ['5', '_unit', 'kg']],
  ])('reads the words in %s as plain words', (input, expected) => {
    expect(tokenize(input)).toEqual(expected.map(text => ({ text })));
  });

  // Only the periods at the end of a token go. A period inside a token stays (AFA-36).
  it('removes every period from the end of a token', () => {
    expect(tokenTexts('6 ft.. 70 kg...')).toEqual(['6', 'ft', '70', 'kg']);
    expect(tokenTexts('5.5. ft')).toEqual(['5.5', 'ft']);
    expect(tokenTexts('a.b. 5 ft')).toEqual(['a.b', '5', 'ft']);
  });
});
