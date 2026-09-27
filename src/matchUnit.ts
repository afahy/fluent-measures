import { levenshtein } from './levenshtein';
import { UNIT_ALIASES } from './units';
import { MeasurementType, Unit } from './types';

/** Prefer exact aliases, then the closest typo that retains enough of the unit's spelling. */
export function matchUnit(word: string, type: MeasurementType, fuzziness?: number): Unit | null {
  let closestUnit: Unit | null = null;
  for (const aliases of UNIT_ALIASES[type]) {
    for (const alias of aliases) {
      if (word === alias) return aliases[0];
      // Food, fool, feed and feel are too close to foot/feet to accept as fuzzy units.
      if (!fuzziness || /^f(oo|ee)[dl]$/.test(word)) continue;
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
