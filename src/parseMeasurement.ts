import { matchUnit } from './matchUnit';
import { parseNumberToken } from './parseNumberToken';
import { tokenize } from './tokenize';
import { wordsToNumber } from './wordsToNumber';

import { unitConversions } from './units';

import { ParseOptions, ParsedValue, Match } from './types';

type QualifiedMatch = Match & { unit: NonNullable<Match['unit']> };

/** Read the longest adjacent number phrase and return its first unconsumed token index. */
function readNumberPhrase(
  tokens: string[],
  start: number,
  step = 1
): [value: number | null, end: number] {
  let end = start;
  let value: number | null = null;
  const words: string[] = [];
  for (; tokens[end] !== undefined; end += step) {
    if (tokens[end] === 'and' || (step < 0 && tokens[end] === ';')) continue;
    if (step > 0) words.push(tokens[end]);
    else words.unshift(tokens[end]);
    const candidate = wordsToNumber(words.join(' '));
    if (candidate === null) break;
    value = candidate;
  }
  return [value, end];
}

/** Parse a height or weight, optionally inferring its unit or normalizing the result. */
export function parseMeasurement(input: string, options: ParseOptions = {}): ParsedValue | null {
  const trimmed = input?.trim();
  if (!trimmed) {
    return null;
  }

  // Replace whole ranges with a boundary so neither endpoint becomes a measurement.
  // Preserve semicolon boundaries so independent fields cannot form a compound height.
  const fuzziness = options.fuzziness;
  const tokens = tokenize(
    input.replace(/(?<![\d.])[\d.]+(?:\s*\p{Dash}\s*[\d.]+)+/gu, ' - '),
    fuzziness
  );
  if (tokens.length && options.allowUnqualified && !options.type) {
    throw new Error('allowUnqualified requires type');
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

  for (const type of options.type ? [options.type] : (['height', 'weight'] as const)) {
    const matches: QualifiedMatch[] = [...shorthandMatches];
    const remainingTokens = matches.length ? [] : [...tokens];

    // Process tokens looking for units and numbers
    for (let i = 0; i < remainingTokens.length; i++) {
      const unit = matchUnit(remainingTokens[i], type, fuzziness);
      if (!unit) {
        continue;
      }

      // Read the preceding phrase first, allowing ordinary punctuation before its unit.
      const [value, end] = readNumberPhrase(remainingTokens, i - 1, -1);
      let num = value ?? parseNumberToken(remainingTokens[end] ?? '');
      let matchStart = value === null ? end : end + 1;
      let matchEnd = i + 1;

      // A signed feet component invalidates its height, including any trailing inches.
      const signed = /^-+[^-]/.test(remainingTokens[matchStart] ?? '');
      if (signed && unit === 'ft') {
        const [, end] = readNumberPhrase(remainingTokens, i + 1);
        if (matchUnit(remainingTokens[end] ?? '', 'height', fuzziness) === 'in') {
          i = end;
        }
        continue;
      }

      // A semicolon can also separate a unit prefix from its value.
      if (!num && (num === null || unit !== 'ft' || remainingTokens[i - 1] === ';') && !signed) {
        while (remainingTokens[matchEnd] === ';') matchEnd++;
        num = parseNumberToken(remainingTokens[matchEnd] ?? '');
        matchStart = i;
        matchEnd++;
      }

      if (num === null) {
        continue;
      }

      matches.push({
        value: num,
        unit,
      });

      // Mark tokens as used by replacing them with empty string
      remainingTokens.fill('', matchStart, matchEnd);

      if (unit === 'ft') {
        const [inches, inchesEnd] = readNumberPhrase(remainingTokens, matchEnd);
        const nextWord = remainingTokens[inchesEnd] ?? '';
        const nextUnit = matchUnit(nextWord, 'height', fuzziness);
        // A following unit owns the number, even when it belongs to another measurement type.
        if (
          inches !== null &&
          (nextUnit === 'in' ||
            (inches > 0 && inches < 12 && !nextUnit && !matchUnit(nextWord, 'weight', fuzziness)))
        ) {
          if (num || inches) matches.push({ value: inches, unit: 'in' });
          else matches.pop();
          remainingTokens.fill('', matchEnd, inchesEnd + (nextUnit === 'in' ? 1 : 0));
        } else if (!num) {
          // An isolated zero must not change the unit of an independent measurement.
          matches.pop();
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
        if (!value) continue;
        if (unit === targetUnit) {
          totalValue += value;
          continue;
        }
        const converter = unitConversions[unit][targetUnit];
        if (!converter) {
          throw new Error(`Cannot convert ${unit} to ${targetUnit}`);
        }
        totalValue += converter(value);
      }

      // A zero-height fragment must not hide a valid measurement of another type.
      if (!totalValue) continue;

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
    const numToken = tokens.filter(token => token !== ';').join(' ');
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
