import { describe, it, expect } from 'vitest';
import { normalizeForms, tokenize, tokenizeNormalized } from '../src/tokenize';

const tokenTexts = (input: string): string[] => tokenize(input).map(({ text }) => text);

// AFA-250: these retain the old literal inputs, but the private token interface now preserves
// every boundary for the complete-entry reader. Original label/field/erasure expectations are
// in design/afa-250/tokenize.test.ts.before.txt; no exported package type changed.
describe('complete-entry tokens', () => {
  // These existing form rules retain quotation boundaries before the strict parser sees
  // them. A rejected prose quotation must not become unit marks during normalization.
  it.each([
    ['‘5’', '‘5’'],
    ['“72”', '“72”'],
    ['‘it’s five’', '‘it’s five’'],
    ['“it’s five”', '“it’s five”'],
    ['‘a” five’', '‘a” five’'],
    ['“a’ five”', '“a’ five”'],
    ['70” KG', '70” KG'],
    ['‘5’ eleven inches', "‘5' eleven inches"],
    ['“72” 60 inches', '“72” 60 inches'],
    ['“72”60 cm', '“72"60 cm'],
  ])('retains the intended quote or unit-mark boundary in %s', (raw, expected) => {
    expect(normalizeForms(raw)).toBe(expected);
  });

  it.each([
    ['180 lbs', ['180', 'lbs']],
    ['six feet', ['six', 'feet']],
    ['HELLO WORLD', ['hello', 'world']],
    ['FiVe FeEt', ['five', 'feet']],
    ['5\' 11"', ['5', "'", '11', '"']],
    ['5\'11"', ['5', "'", '11', '"']],
    ['180cm', ['180', 'cm']],
    ['72.5kg', ['72.5', 'kg']],
    ['72.5 kg', ['72.5', 'kg']],
    ['5.11 meters', ['5.11', 'meters']],
    ['72,5 kg', ['72.5', 'kg']],
    ['72,05kg', ['72.05', 'kg']],
    ['1,000 lbs', ['1000', 'lbs']],
    ['1,000,000 lbs', ['1000000', 'lbs']],
    ['12,345,678.9 lbs', ['12345678.9', 'lbs']],
    ['-72,5 kg', ['-', '72.5', 'kg']],
    ['-1,000 lbs', ['-', '1000', 'lbs']],
    ['12,34,567 kg', []],
    ['1234,567 kg', []],
    ['weight, 72 kg', ['weight', ',', '72', 'kg']],
    ['72, kg', ['72', ',', 'kg']],
    ['72, 5 kg', ['72', ',', '5', 'kg']],
    ['72 kg,180 cm', ['72', 'kg', ',', '180', 'cm']],
    ['1,2345 lbs', ['1', ',', '2345', 'lbs']],
    ['180 lb.', ['180', 'lb.']],
    ['72.5 kg.', ['72.5', 'kg.']],
    ['-5 feet', ['-', '5', 'feet']],
    ['-72.5 kg', ['-', '72.5', 'kg']],
    ['5-11', ['5', '-', '11']],
    ['5-foot-11', ['5', '-', 'foot', '-', '11']],
    ['5-foot-11.5', ['5', '-', 'foot', '-', '11.5']],
    ['height-5feet', ['height', '-', '5', 'feet']],
    ['height -5feet', ['height', '-', '5', 'feet']],
    ['height\t-5.5ft', ['height', '-', '5.5', 'ft']],
    ['height\n-5ft', ['height', '-', '5', 'ft']],
    ['5    11', ['5', '11']],
    ['  180  lbs  ', ['180', 'lbs']],
    ['5\'   11"', ['5', "'", '11', '"']],
    ['  ', []],
    ['', []],
    ['180@lbs', ['180', '@', 'lbs']],
    ['five&feet', ['five', '&', 'feet']],
    ['72.5!kg', ['72.5', '!', 'kg']],
    ['5\'11" tall', ['5', "'", '11', '"', 'tall']],
    ['72.5kg.', ['72.5', 'kg.']],
    ['Six-Foot-Two', ['six', '-', 'foot', '-', 'two']],
    ['(kg) 72', ['(', 'kg', ')', '72']],
    ['72 in. tall', ['72', 'in.', 'tall']],
    ['in: 72', ['in', ':', '72']],
    ['age 28 (m): 1.8', ['age', '28', '(', 'm', ')', ':', '1.8']],
    ['age=28, in=72', ['age', '=', '28', ',', 'in', '=', '72']],
    ['72 kg; lb: 158', ['72', 'kg', ';', 'lb', ':', '158']],
    ['NAME UNIT kg FIELD 5', ['name', 'unit', 'kg', 'field', '5']],
    ['5 _unit kg', ['5', '_unit', 'kg']],
    ['6 ft.. 70 kg...', ['6', 'ft.', '.', '70', 'kg.', '..']],
    ['5.5. ft', ['5.5', '.', 'ft']],
    ['a.b. 5 ft', ['a.', 'b.', '5', 'ft']],
    ['“+5” kg', ['“', '+', '5', '”', 'kg']],
    ['70 kg 🧊', ['70', 'kg', '🧊']],
    ['I’m 70 kg', ['i’m', '70', 'kg']],
  ])('retains the full normalized token sequence in %s', (raw, expected) => {
    expect(tokenTexts(raw as string)).toEqual(expected);
  });

  it('retains adjacency and spacing in normalized coordinates', () => {
    expect(tokenizeNormalized('5 ft-11')).toEqual([
      { text: '5', start: 0, end: 1 },
      { text: 'ft', start: 2, end: 4 },
      { text: '-', start: 4, end: 5 },
      { text: '11', start: 5, end: 7 },
    ]);
    expect(tokenizeNormalized('5 ft -11')).toEqual([
      { text: '5', start: 0, end: 1 },
      { text: 'ft', start: 2, end: 4 },
      { text: '-', start: 5, end: 6 },
      { text: '11', start: 6, end: 8 },
    ]);
  });

  it('retains a number word period as punctuation without changing unit labels', () => {
    expect(tokenizeNormalized('in: seventy three.')).toEqual([
      { text: 'in', start: 0, end: 2 },
      { text: ':', start: 2, end: 3 },
      { text: 'seventy', start: 4, end: 11 },
      { text: 'three', start: 12, end: 17 },
      { text: '.', start: 17, end: 18 },
    ]);
    expect(tokenTexts('kg one hundred.')).toEqual(['kg', 'one', 'hundred', '.']);
    expect(tokenTexts('pounds six and a half.')).toEqual([
      'pounds',
      'six',
      'and',
      'a',
      'half',
      '.',
    ]);
    expect(tokenTexts('in. 73')).toEqual(['in.', '73']);
    expect(tokenTexts('kg mystery.')).toEqual(['kg', 'mystery.']);
    expect(tokenTexts('kg seventy two..')).toEqual(['kg', 'seventy', 'two', '.', '.']);
  });

  it('retains one period after a complete decimal without splitting malformed dot runs', () => {
    expect(tokenizeNormalized('kg 72.5.')).toEqual([
      { text: 'kg', start: 0, end: 2 },
      { text: '72.5', start: 3, end: 7 },
      { text: '.', start: 7, end: 8 },
    ]);
    expect(tokenTexts('kg: ½.')).toEqual(['kg', ':', '0.5', '.']);
    expect(tokenTexts('kg .5.')).toEqual(['kg', '.5', '.']);
    expect(tokenTexts('72. kg')).toEqual(['72.', 'kg']);
    expect(tokenTexts('kg 72.5..')).toEqual(['kg', '72.5..']);
    expect(tokenTexts('kg 72..5.')).toEqual(['kg', '72..5.']);
    expect(tokenTexts('kg mystery.')).toEqual(['kg', 'mystery.']);
  });
});
