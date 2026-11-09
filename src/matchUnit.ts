import { levenshtein } from './levenshtein';
import { UNIT_ALIASES } from './units';
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

// English words one edit from a unit name that are blocked after review, because they are
// common near a number in prose. tests/fixtures/unitTypos/englishWords.json lists the reviewed
// words, both blocked and allowed.
const BLOCKED = new Set(
  'feat fee feed feel fees felt fleet font food fool footy fort fret inca inched incl incr itch itches kill kills kiln kilns kilt kilts meteor meteors miter miters'.split(
    ' '
  )
);

/**
 * Prefer exact aliases. With fuzzy, read a word one edit from a unit name of four or more letters
 * that starts with the same letter. The first unit in UNIT_ALIASES order wins a tie.
 */
export function matchUnit(word: string, type: MeasurementType, fuzzy?: boolean): Unit | null {
  let closestUnit: Unit | null = null;
  for (const aliases of UNIT_ALIASES[type]) {
    for (const alias of aliases) {
      if (word === alias) return aliases[0];
      if (
        !closestUnit &&
        fuzzy &&
        !BLOCKED.has(word) &&
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
