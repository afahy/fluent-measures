import { levenshtein } from './levenshtein';
import { UNIT_ALIASES } from './units';
import { MeasurementType, Unit } from './types';

// The British spellings, which match only exactly, not as typos.
const EXACT_ALIASES = new Set(['centimetre', 'centimetres', 'metre', 'metres']);

/** Prefer exact aliases, then the closest typo that retains enough of the unit's spelling. */
export function matchUnit(word: string, type: MeasurementType, fuzziness?: number): Unit | null {
  let closestUnit: Unit | null = null;
  for (const aliases of UNIT_ALIASES[type]) {
    for (const alias of aliases) {
      if (word === alias) return aliases[0];
      // Exclude common prose near foot/feet and kilo/kilos. British spellings match only exactly,
      // so they add no fuzzy matches for prose such as "mere" and "metro".
      if (!fuzziness || EXACT_ALIASES.has(alias) || /^(f(oo|ee)[dl]|kills?)$/.test(word)) continue;
      if (word[0] !== alias[0]) continue;
      const distance = levenshtein(word, alias);
      // Keep edits below a third of the alias length; short abbreviations stay exact-only.
      if (distance <= fuzziness && distance * 3 < alias.length) {
        closestUnit = aliases[0];
        // Only a strictly closer alias can replace this match; exact aliases still win.
        fuzziness = distance - 1;
      }
    }
  }
  return closestUnit;
}
