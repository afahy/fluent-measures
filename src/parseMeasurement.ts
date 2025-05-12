import { matchUnit } from './matchUnit';
import { tokenize } from './tokenize';
import { wordsToNumber } from './wordsToNumber';
import {
  NORMALIZED_UNITS,
  ftToIn,
  ftToCm,
  inToFt,
  inToCm,
  cmToIn,
  cmToFt,
  mToCm,
  cmToM,
  lbToKg,
  kgToLb,
} from './units';

import { ParseOptions, ParsedValue, MeasurementType, ParsedComponent } from './types';

const unitConversions: Record<string, Record<string, (value: number) => number>> = {
  ft: { in: ftToIn, cm: ftToCm },
  in: { ft: inToFt, cm: inToCm },
  cm: { in: cmToIn, ft: cmToFt, m: cmToM },
  m: { cm: mToCm },
  lb: { kg: lbToKg },
  kg: { lb: kgToLb },
};

export function parseMeasurement(input: string, options: ParseOptions = {}): ParsedValue | null {
  const tokens = tokenize(input);
  const raw = input;
  const fuzziness = options.fuzziness ?? 0;

  if (options.allowUnqualified && !options.type) {
    throw new Error('If allowUnqualified is true, type must be provided.');
  }

  const typesToCheck: MeasurementType[] = options.type ? [options.type] : ['height', 'weight'];
  const components: ParsedComponent[] = [];

  // Try each measurement type
  for (const type of typesToCheck) {
    let hasMatch = false;

    // Process tokens looking for units and numbers
    for (let i = 0; i < tokens.length; i++) {
      const word = tokens[i];
      const unit = matchUnit(word, type, fuzziness);
      if (!unit) continue;

      // Look for number in adjacent tokens (before or after)
      let num: number | null = null;
      let numberToken = '';

      // Check previous token first (more common)
      if (i > 0) {
        numberToken = tokens[i - 1];
        num = parseFloat(numberToken);
        if (isNaN(num)) {
          const extracted = wordsToNumber(numberToken);
          if (extracted !== null) num = extracted;
        }
      }

      // If no number found and not last token, check next token
      if (num === null && i < tokens.length - 1) {
        numberToken = tokens[i + 1];
        num = parseFloat(numberToken);
        if (isNaN(num)) {
          const extracted = wordsToNumber(numberToken);
          if (extracted !== null) num = extracted;
        }
      }

      if (num === null) continue;

      const matchStr =
        unit === 'ft' && word === "'"
          ? `${numberToken}'`
          : unit === 'in' && word === '"'
            ? `${numberToken}"`
            : `${numberToken} ${word}`;

      components.push({
        value: num,
        unit,
        match: matchStr.trim(),
      });

      hasMatch = true;
      // Remove both tokens
      if (i > 0 && tokens[i - 1] === numberToken) {
        tokens.splice(i - 1, 2);
        i -= 2;
      } else if (i < tokens.length - 1 && tokens[i + 1] === numberToken) {
        tokens.splice(i, 2);
        i -= 1;
      }
    }

    // If we found any matches for this type
    if (hasMatch) {
      // Determine the output unit
      let outputUnit = options.normalizedUnit;
      if (!outputUnit) {
        // If we have components, use the unit of the first component
        outputUnit = components.length > 0 ? (components[0].unit ?? undefined) : undefined;

        // If we still don't have a unit, use the preferred system's unit
        if (!outputUnit) {
          const preferredSystem = options.inferUnit || 'imperial';
          outputUnit = NORMALIZED_UNITS[type][preferredSystem];
        }
      }

      // Calculate total value
      let totalValue = 0;
      for (const component of components) {
        if (!component.unit) continue;

        // If we need to normalize, convert all components to the target unit
        if (options.normalizedUnit) {
          if (component.unit === outputUnit) {
            totalValue += component.value;
          } else {
            const converter = unitConversions[component.unit]?.[outputUnit];
            if (converter) {
              totalValue += converter(component.value);
            } else {
              throw new Error(
                `Unsupported unit conversion from ${component.unit} to ${outputUnit}`
              );
            }
          }
        } else {
          // If no normalization needed, just use the first component's value
          totalValue = component.value;
          break;
        }
      }

      return {
        value: totalValue,
        unit: outputUnit,
        type,
        components: options.returnComponents ? components : undefined,
        raw,
      };
    }
  }

  // Try unqualified input if no matches found
  if (options.allowUnqualified && options.type) {
    let num = parseFloat(tokens[0]);
    if (isNaN(num)) num = wordsToNumber(tokens.join(' ')) ?? NaN;
    if (!isNaN(num)) {
      const unit =
        options.inferUnit === 'metric'
          ? options.type === 'weight'
            ? 'kg'
            : 'cm'
          : options.type === 'weight'
            ? 'lb'
            : 'in';
      return {
        value: num,
        unit,
        type: options.type,
        raw,
      };
    }
  }

  return null;
}
