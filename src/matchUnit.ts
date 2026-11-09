import { UNIT_ALIASES } from './units';
import { MeasurementType, Unit } from './types';

/** Read an exact alias; unknown spellings do not supply a unit. */
export function matchUnit(word: string, type: MeasurementType): Unit | null {
  for (const aliases of UNIT_ALIASES[type]) {
    if (aliases.includes(word)) return aliases[0];
  }
  return null;
}
