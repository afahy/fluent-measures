import { describe, expect, it } from 'vitest';
import { matchUnit } from '../src/matchUnit';

// AFA-253 approval: fixed exact aliases, without edit-distance inference. These literal
// expectations come from the public alias list, not UNIT_ALIASES or the matcher under test.
describe('exact unit aliases', () => {
  it.each([
    ['ft', 'height', 'ft'],
    ['feet', 'height', 'ft'],
    ['foot', 'height', 'ft'],
    ["'", 'height', 'ft'],
    ['in', 'height', 'in'],
    ['inch', 'height', 'in'],
    ['inches', 'height', 'in'],
    ['"', 'height', 'in'],
    ['cm', 'height', 'cm'],
    ['cms', 'height', 'cm'],
    ['centimeter', 'height', 'cm'],
    ['centimeters', 'height', 'cm'],
    ['centimetre', 'height', 'cm'],
    ['centimetres', 'height', 'cm'],
    ['m', 'height', 'm'],
    ['meter', 'height', 'm'],
    ['meters', 'height', 'm'],
    ['metre', 'height', 'm'],
    ['metres', 'height', 'm'],
    ['lb', 'weight', 'lb'],
    ['lbs', 'weight', 'lb'],
    ['pound', 'weight', 'lb'],
    ['pounds', 'weight', 'lb'],
    ['kg', 'weight', 'kg'],
    ['kgs', 'weight', 'kg'],
    ['kilo', 'weight', 'kg'],
    ['kilos', 'weight', 'kg'],
    ['kilogram', 'weight', 'kg'],
    ['kilograms', 'weight', 'kg'],
    ['kilogramme', 'weight', 'kg'],
    ['kilogrammes', 'weight', 'kg'],
  ] as const)('matches %s as %s / %s', (word, type, unit) => {
    expect(matchUnit(word, type)).toBe(unit);
  });
  it.each([
    'food',
    'feel',
    'feed',
    'fool',
    'kill',
    'kills',
    'mere',
    'meres',
    'centimetry',
    'centimetros',
    'metro',
    'xilograms',
    'xentimeters',
    'fxxt',
    'kixxs',
    'kilogxxms',
    'fts',
    'kgg',
    'lxs',
    'ls',
    'fett',
    'kilgrm',
    'inche',
    'metter',
    'feat',
    'inchez',
    'killo',
    'feetxx',
    'inchxy',
    'kiloxx',
    'xyz',
    'abc',
    'f',
    'i',
    'k',
    '',
    'foots',
    'inc',
    'fees',
    'ponds',
    'kilns',
  ])('rejects unlisted spelling %s in either dimension', word => {
    expect(matchUnit(word, 'height')).toBeNull();
    expect(matchUnit(word, 'weight')).toBeNull();
  });
  it('does not cross dimensions', () => {
    expect(matchUnit('kg', 'height')).toBeNull();
    expect(matchUnit('cm', 'weight')).toBeNull();
  });
});
