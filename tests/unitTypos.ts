// The one-edit spellings that `fuzzy: true` reads, built from the documented rules alone, not from
// matchUnit (AGENTS.md rule 10). The unit names come from README.md, "Supported units", and the
// rules from PARSING.md, "Fuzzy Matching" (AFA-253).
import type { MeasurementType, Unit } from '../src';

/** README "Supported units", in PARSING.md's tie order: ft, in, cm, m, then lb, kg. */
export const UNIT_NAMES: Readonly<Record<MeasurementType, readonly (readonly [Unit, string[]])[]>> =
  {
    height: [
      ['ft', ['ft', 'feet', 'foot']],
      ['in', ['in', 'inch', 'inches']],
      ['cm', ['cm', 'cms', 'centimeter', 'centimeters', 'centimetre', 'centimetres']],
      ['m', ['m', 'meter', 'meters', 'metre', 'metres']],
    ],
    weight: [
      ['lb', ['lb', 'lbs', 'pound', 'pounds']],
      ['kg', ['kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms', 'kilogramme', 'kilogrammes']],
    ],
  };

/** PARSING.md: the British spellings match only when they are exact. */
const BRITISH = new Set([
  'centimetre',
  'centimetres',
  'metre',
  'metres',
  'kilogramme',
  'kilogrammes',
]);

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

/** Every word one letter added, removed or changed from `name`, with letters a to z. */
export function oneEdits(name: string): Set<string> {
  const words = new Set<string>();
  for (let at = 0; at <= name.length; at++) {
    for (const letter of LETTERS) {
      words.add(name.slice(0, at) + letter + name.slice(at));
      if (at < name.length && letter !== name[at]) {
        words.add(name.slice(0, at) + letter + name.slice(at + 1));
      }
    }
    if (at < name.length) words.add(name.slice(0, at) + name.slice(at + 1));
  }
  return words;
}

/**
 * PARSING.md, "Fuzzy Matching": the fuzzy typo list, which only fuzzy reads (AFA-280 fills it).
 * "kilgrm" is two edits from "kilogram"; main read it as kg with fuzziness 2 (AFA-253 comment
 * d5897102).
 */
export const FUZZY_TYPOS: Readonly<Record<MeasurementType, Readonly<Record<string, Unit>>>> = {
  height: {},
  weight: { kilgrm: 'kg' },
};

const SPELLINGS = new Map<MeasurementType, Map<string, Unit>>();

/**
 * The spellings one edit from a unit name, with the unit that PARSING.md gives each one: the word
 * starts with the name's first letter, the name has four or more letters and isn't a British
 * spelling, and the first unit in tie order wins.
 */
export function oneEditSpellings(type: MeasurementType): Map<string, Unit> {
  const cached = SPELLINGS.get(type);
  if (cached) return cached;
  const exact = new Set(UNIT_NAMES[type].flatMap(([, names]) => names));
  const spellings = new Map<string, Unit>();
  for (const [unit, names] of UNIT_NAMES[type]) {
    for (const name of names) {
      if (name.length < 4 || BRITISH.has(name)) continue;
      for (const word of oneEdits(name)) {
        if (word[0] === name[0] && !exact.has(word) && !spellings.has(word)) {
          spellings.set(word, unit);
        }
      }
    }
  }
  SPELLINGS.set(type, spellings);
  return spellings;
}

/** The unit that PARSING.md gives a word of the type, with fuzzy on or off. */
export function expectedUnit(word: string, type: MeasurementType, fuzzy: boolean): Unit | null {
  const exact = UNIT_NAMES[type].find(([, names]) => names.includes(word));
  if (exact) return exact[0];
  if (!fuzzy) return null;
  return FUZZY_TYPOS[type][word] ?? oneEditSpellings(type).get(word) ?? null;
}
