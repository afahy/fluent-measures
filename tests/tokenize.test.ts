import { describe, it, expect } from 'vitest';
import { tokenize, tokenizeNormalized } from '../src/tokenize';

const tokenTexts = (input: string): string[] => tokenize(input).map(({ text }) => text);

// AFA-250: these retain the old literal inputs, but the private token interface now preserves
// every boundary for the complete-entry reader. Original label/field/erasure expectations are
// in design/afa-250/tokenize.test.ts.before.txt; no exported package type changed.
describe('complete-entry tokens', () => {
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
    ['5.5. ft', ['5.5.', 'ft']],
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
});
