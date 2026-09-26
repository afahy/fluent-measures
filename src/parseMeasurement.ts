import { matchUnit } from './matchUnit';
import { parseNumberToken } from './parseNumberToken';
import { tokenize } from './tokenize';
import { wordsToNumber } from './wordsToNumber';

import { unitConversions } from './units';

import { ParseOptions, ParsedValue, MeasurementType, Match } from './types';

type QualifiedMatch = Match & { unit: NonNullable<Match['unit']> };

function readNumberPhrase(
  tokens: string[],
  start: number,
  step = 1
): [value: number | null, end: number] {
  let end = start;
  let value: number | null = null;
  const words: string[] = [];
  for (; end >= 0 && end < tokens.length; end += step) {
    if (tokens[end] === 'and') continue;
    if (step > 0) words.push(tokens[end]);
    else words.unshift(tokens[end]);
    const candidate = wordsToNumber(words.join(' '));
    if (candidate === null) break;
    value = candidate;
  }
  return [value, end];
}

export function parseMeasurement(input: string, options: ParseOptions = {}): ParsedValue | null {
  const trimmed = input?.trim();
  if (!trimmed) {
    return null;
  }

  // Replace whole ranges with a boundary so neither endpoint becomes a measurement.
  // Preserve semicolon boundaries so independent fields cannot form a compound height.
  const fuzziness = options.fuzziness ?? 0;
  const tokens = tokenize(
    input.replace(/(?<![\d.])[\d.]+(?:\s*[-–—]\s*[\d.]+)+|;/g, ' - '),
    fuzziness
  );
  if (!tokens.length) {
    return null;
  }

  if (options.allowUnqualified && !options.type) {
    throw new Error('If allowUnqualified is true, type must be provided.');
  }

  const shorthandMatches: QualifiedMatch[] = [];
  const shorthand = /^(\d+)-((?:\d*\.)?\d+)$/.exec(trimmed);
  if (shorthand) {
    // Bare N-M is ambiguous unless the caller explicitly requests a height.
    const feet = +shorthand[1];
    const inches = +shorthand[2];
    if (options.type !== 'height' || feet === Infinity || inches >= 12) return null;
    shorthandMatches.push({ value: feet, unit: 'ft' }, { value: inches, unit: 'in' });
  }

  const typesToCheck: MeasurementType[] = options.type ? [options.type] : ['height', 'weight'];

  for (const type of typesToCheck) {
    const matches: QualifiedMatch[] = [...shorthandMatches];
    const remainingTokens = matches.length ? [] : [...tokens];

    // Process tokens looking for units and numbers
    for (let i = 0; i < remainingTokens.length; i++) {
      const unit = matchUnit(remainingTokens[i], type, fuzziness);
      if (!unit) {
        continue;
      }

      // Look for number in adjacent tokens (before or after)
      let num: number | null = null;
      let numberStart = i - 1;
      let numberEnd = i;

      // Check previous token first (more common)
      if (remainingTokens[i - 1]) {
        num = parseNumberToken(remainingTokens[i - 1]);
        const [value, end] = readNumberPhrase(remainingTokens, i - 1, -1);
        // Keep the longest phrase, including explicit zero components in compound heights.
        if (value !== null && (value > 0 || unit === 'ft' || unit === 'in')) {
          num = value;
          numberStart = end + 1;
        }
      }

      // A signed feet component invalidates its height, including any trailing inches.
      const signed = /^-+[^-]/.test(remainingTokens[i - 1] ?? '');
      if (signed && unit === 'ft') {
        const [, end] = readNumberPhrase(remainingTokens, i + 1);
        if (matchUnit(remainingTokens[end] ?? '', 'height', fuzziness) === 'in') {
          i = end;
        }
        continue;
      }

      // If no number found and not last token, check next token
      if (num === null && !signed && remainingTokens[i + 1]) {
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

      // Mark tokens as used by replacing them with empty string
      remainingTokens.fill('', Math.min(numberStart, i), Math.max(numberEnd, i + 1));

      if (unit === 'ft') {
        const inchesStart = Math.max(numberEnd, i + 1);
        const [inches, inchesEnd] = readNumberPhrase(remainingTokens, inchesStart);
        const nextWord = remainingTokens[inchesEnd] ?? '';
        // A following unit owns the number, even when it belongs to another measurement type.
        if (
          inches !== null &&
          inches > 0 &&
          inches < 12 &&
          !matchUnit(nextWord, 'height', fuzziness) &&
          !matchUnit(nextWord, 'weight', fuzziness)
        ) {
          matches.push({ value: inches, unit: 'in' });
          remainingTokens.fill('', inchesStart, inchesEnd);
        }
      }
    }

    // If we found any matches for this type
    if (matches.length) {
      // For height measurements with multiple components, always normalize to inches
      // For other cases, use the input unit unless normalization is requested
      const targetUnit =
        options.normalizedUnit ||
        (type === 'height' && matches.length > 1 ? 'in' : matches[0].unit);
      let totalValue = 0;

      for (const { value, unit } of matches) {
        // Zero components contribute nothing, including across measurement types.
        if (value === 0) continue;
        if (unit === targetUnit) {
          totalValue += value;
          continue;
        }
        const converter = unitConversions[unit][targetUnit];
        if (!converter) {
          throw new Error(`Unsupported unit conversion from ${unit} to ${targetUnit}`);
        }
        totalValue += converter(value);
      }

      // A zero-height fragment must not hide a valid measurement of another type.
      if (totalValue <= 0) continue;

      return {
        value: totalValue,
        unit: targetUnit,
        type,
        raw: input,
        matches,
      };
    }
  }

  // Try unqualified input if no matches found and all previous attempts failed
  if (options.allowUnqualified && options.type) {
    const numToken = tokens.join(' ');
    const num = tokens.length > 1 ? wordsToNumber(numToken) : parseNumberToken(numToken);
    if (num !== null && num > 0) {
      const metric = options.inferUnit === 'metric';
      const unit = options.type === 'height' ? (metric ? 'cm' : 'in') : metric ? 'kg' : 'lb';

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
        raw: input,
      };
    }
  }

  return null;
}
