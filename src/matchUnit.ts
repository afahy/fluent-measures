import { levenshtein } from './levenshtein';
import { UNITS, UNIT_ALIASES } from './units';
import { MeasurementType, Unit } from './types';

export function matchUnit(word: string, type: MeasurementType, fuzziness: number = 0): Unit | null {
  for (const unit of UNITS[type]) {
    if (UNIT_ALIASES[unit].includes(word)) return unit;
  }
  if (fuzziness > 0 && word.length >= 3) {
    for (const unit of UNITS[type]) {
      for (const alias of UNIT_ALIASES[unit]) {
        if (alias.length >= 3 && levenshtein(word, alias) <= fuzziness) {
          return unit;
        }
      }
    }
  }
  return null;
}
