import { levenshtein } from './levenshtein';
import { FUZZY_TYPOS, UNIT_ALIASES, UNIT_TYPES } from './units';
import { MeasurementType, Unit } from './types';

// The British spellings, which match only exactly, not as typos.
const EXACT_ALIASES = new Set([
  'centimetre',
  'centimetres',
  'metre',
  'metres',
  'kilogramme',
  'kilogrammes',
]);

/**
 * Prefer exact aliases. With fuzzy, read a reviewed typo, or a word one edit from a unit name of
 * four or more letters that starts with the same letter. The first unit in UNIT_ALIASES order
 * wins a tie.
 */
export function matchUnit(word: string, type: MeasurementType, fuzzy?: boolean): Unit | null {
  const typo = fuzzy && FUZZY_TYPOS.get(word);
  if (typo && UNIT_TYPES[typo] === type) return typo;
  let closestUnit: Unit | null = null;
  for (const aliases of UNIT_ALIASES[type]) {
    for (const alias of aliases) {
      if (word === alias) return aliases[0];
      if (
        !closestUnit &&
        fuzzy &&
        !EXACT_ALIASES.has(alias) &&
        alias.length > 3 &&
        word[0] === alias[0] &&
        levenshtein(word, alias) === 1
      )
        closestUnit = aliases[0];
    }
  }
  return closestUnit;
}
