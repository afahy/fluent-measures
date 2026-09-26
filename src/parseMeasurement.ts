import { matchUnit } from './matchUnit';
import { parseNumberToken } from './parseNumberToken';
import { tokenize } from './tokenize';
import { wordsToNumber } from './wordsToNumber';

import { NORMALIZED_UNITS, unitConversions } from './units';

import { ParseOptions, ParsedValue, MeasurementType, Match } from './types';

export function parseMeasurement(input: string, options: ParseOptions = {}): ParsedValue | null {
  if (!input?.trim()) {
    return null;
  }

  const tokens = tokenize(input);
  if (!tokens.length) {
    return null;
  }

  const raw = input;
  const fuzziness = options.fuzziness ?? 0;

  if (options.allowUnqualified && !options.type) {
    throw new Error('If allowUnqualified is true, type must be provided.');
  }

  const typesToCheck: MeasurementType[] = options.type ? [options.type] : ['height', 'weight'];

  for (const type of typesToCheck) {
    const matches: Match[] = [];
    let hasMatch = false;
    const remainingTokens = [...tokens];

    // Process tokens looking for units and numbers
    for (let i = 0; i < remainingTokens.length; i++) {
      const word = remainingTokens[i];

      // Skip empty tokens
      if (!word) {
        continue;
      }

      const unit = matchUnit(word, type, fuzziness);
      if (!unit) {
        continue;
      }

      // Look for number in adjacent tokens (before or after)
      let num: number | null = null;
      let numberStart = i - 1;
      let numberEnd = i;

      // Check previous token first (more common)
      if (i > 0 && remainingTokens[i - 1]) {
        num = parseNumberToken(remainingTokens[i - 1]);
        const numberWords: string[] = [];
        for (let j = i - 1; j >= 0; j--) {
          // Conjunctions do not change the value or grow the phrase being reparsed.
          if (remainingTokens[j] === 'and') continue;
          if (wordsToNumber(remainingTokens[j]) === null) break;
          numberWords.unshift(remainingTokens[j]);
          const phrase = wordsToNumber(numberWords.join(' '));
          if (phrase === null) break;
          // Keep the longest valid phrase next to the unit, without summing independent values.
          if (phrase !== null && phrase > 0) {
            num = phrase;
            numberStart = j;
          }
        }
      }

      // If no number found and not last token, check next token
      if (num === null && i < remainingTokens.length - 1 && remainingTokens[i + 1]) {
        num = parseNumberToken(remainingTokens[i + 1]);
        numberStart = i + 1;
        numberEnd = i + 2;
      }

      if (num === null) {
        continue;
      }

      matches.push({
        value: num,
        unit,
      });

      hasMatch = true;
      // Mark tokens as used by replacing them with empty string
      remainingTokens.fill('', Math.min(numberStart, i), Math.max(numberEnd, i + 1));

      if (unit === 'ft') {
        const inchesStart = Math.max(numberEnd, i + 1);
        let inchesEnd = inchesStart;
        let inches: number | null = null;
        const inchWords: string[] = [];
        for (; inchesEnd < remainingTokens.length; inchesEnd++) {
          const next = remainingTokens[inchesEnd];
          if (next === 'and') continue;
          inchWords.push(next);
          const candidate = wordsToNumber(inchWords.join(' '));
          if (candidate === null) break;
          inches = candidate;
        }
        const nextWord = remainingTokens[inchesEnd] ?? '';
        // A following unit owns the number, even when it belongs to another measurement type.
        // Keep values joined by "and" with the following measurement too.
        if (
          inches !== null &&
          inches > 0 &&
          inches < 12 &&
          remainingTokens[inchesEnd - 1] !== 'and' &&
          !matchUnit(nextWord, 'height', fuzziness) &&
          !matchUnit(nextWord, 'weight', fuzziness)
        ) {
          matches.push({ value: inches, unit: 'in' });
          remainingTokens.fill('', inchesStart, inchesEnd);
        }
      }
    }

    // If we found any matches for this type
    if (hasMatch) {
      // For height measurements with multiple components, always normalize to inches
      // For other cases, use the input unit unless normalization is requested
      const targetUnit =
        options.normalizedUnit ||
        (type === 'height' && matches.length > 1 ? 'in' : matches[0].unit) ||
        NORMALIZED_UNITS[type]['imperial'];
      let totalValue = 0;

      for (const component of matches) {
        if (!component.unit) continue;

        let convertedValue: number;
        if (component.unit === targetUnit) {
          convertedValue = component.value;
        } else {
          const converter = unitConversions[component.unit]?.[targetUnit];
          if (!converter) {
            throw new Error(`Unsupported unit conversion from ${component.unit} to ${targetUnit}`);
          }
          convertedValue = converter(component.value);
        }
        totalValue += convertedValue;
      }

      // Return null for zero or negative total values
      if (totalValue <= 0) return null;

      return {
        value: totalValue,
        unit: targetUnit,
        type,
        raw,
        matches,
      };
    }
  }

  // Try unqualified input if no matches found and all previous attempts failed
  if (options.allowUnqualified && options.type) {
    const numToken = tokens.filter(Boolean).join(' ');
    const num = tokens.length > 1 ? wordsToNumber(numToken) : parseNumberToken(numToken);
    if (num !== null && num > 0) {
      const isMetric = options.inferUnit === 'metric';
      const unit = NORMALIZED_UNITS[options.type][isMetric ? 'metric' : 'imperial'];

      return {
        matches: [
          {
            value: num,
            unit,
          },
        ],
        value: num,
        unit,
        type: options.type,
        raw,
      };
    }
  }

  return null;
}
