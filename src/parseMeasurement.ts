import { matchUnit } from './matchUnit';
import { normalizeNumericCommas, tokenizeNormalized } from './tokenize';
import { wordsToNumber } from './wordsToNumber';

import { LABEL_ALIASES, NEXT_PART, UNSUPPORTED_WEIGHT_UNITS, unitConversions } from './units';

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

/** Return the index of the first token at or after `start` that isn't a semicolon. */
function skipSemicolons(tokens: string[], start: number): number {
  while (tokens[start] === ';') start++;
  return start;
}

/** Parse a height or weight, optionally inferring its unit or normalizing the result. */
export function parseMeasurement(input: string, options: ParseOptions = {}): ParsedValue | null {
  const trimmed = normalizeNumericCommas(input?.trim() || '');
  if (!trimmed) {
    return null;
  }

  // Replace whole ranges with a boundary so neither endpoint becomes a measurement.
  // Preserve semicolon boundaries so independent fields cannot form a compound height.
  const fuzziness = options.fuzziness;
  const isWeightUnit = (token = '') => matchUnit(token, 'weight', fuzziness) !== null;
  let tokens = tokenizeNormalized(
    trimmed.replace(/(?<![\d.])[\d.]+(?:\s*\p{Dash}\s*[\d.]+)+/gu, ' - '),
    fuzziness
  );
  if (tokens.length && options.allowUnqualified && !options.type) {
    throw new Error('allowUnqualified requires type');
  }

  const shorthand = trimmed.match(/^(\d+)-((?:\d*\.)?\d+)$/);
  if (shorthand) {
    // Bare N-M is ambiguous unless the caller explicitly requests a height.
    if (options.type !== 'height' || +shorthand[1] === Infinity || +shorthand[2] >= 12) return null;
    // Feed the components through the same parser as explicit feet and inches.
    tokens = [shorthand[1], 'ft', shorthand[2], 'in'];
  }

  for (const type of options.type ? [options.type] : (['height', 'weight'] as const)) {
    const matches: QualifiedMatch[] = [];
    const remainingTokens = [...tokens];

    // Process tokens looking for units and numbers
    for (let i = 0; i < remainingTokens.length; i++) {
      const unit = matchUnit(remainingTokens[i], type, fuzziness);
      if (!unit) {
        // A number in an unsupported weight unit next to a supported part, as in "12st 4lb" or
        // "7 lb 8 oz", would leave the weight incomplete. An unrelated amount elsewhere, as in
        // "8 oz of water", doesn't count. "st" after a whole number that ends in 1, except 11, is
        // an ordinal, as in "Oct 1st", but "10.1st" is stone.
        const word = remainingTokens[i];
        if (type === 'weight' && UNSUPPORTED_WEIGHT_UNITS.test(word)) {
          const [before, beforeEnd] = readNumberPhrase(remainingTokens, i - 1, -1);
          const [, afterEnd] = readNumberPhrase(tokens, i + 1);
          // Earlier matches blank their tokens, so check the original tokens for a unit.
          if (
            before !== null &&
            !(word === 'st' && /^(?:\d*[02-9])?1$/.test(remainingTokens[i - 1])) &&
            (isWeightUnit(tokens[beforeEnd]) || isWeightUnit(tokens[afterEnd]))
          ) {
            return null;
          }
        }
        continue;
      }

      // Read the preceding phrase first, allowing ordinary punctuation before its unit.
      let [num, end] = readNumberPhrase(remainingTokens, i - 1, -1);
      let matchStart = num === null ? end : end + 1;
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

      // A semicolon can also separate a unit prefix from its value. Short aliases such as "in"
      // are words before a number ("in 2020"), so only their spelled-out labels are prefixes.
      if (
        !num &&
        (num === null || unit !== 'ft' || remainingTokens[i - 1] === ';') &&
        !signed &&
        !LABEL_ALIASES.has(remainingTokens[i])
      ) {
        matchEnd = skipSemicolons(remainingTokens, matchEnd);
        num = wordsToNumber(remainingTokens[matchEnd] ?? '') || null;
        // A label doesn't take a number that has its own unit, as in "weigh in: 180 lbs", unless
        // that unit starts the next part of the measurement with its own number: "m: 1 cm: 80".
        // Semicolons can come between a number and its unit, as in "180; lbs".
        const unitAt = skipSemicolons(remainingTokens, matchEnd + 1);
        const next = remainingTokens[unitAt] ?? '';
        const nextUnit =
          matchUnit(next, 'height', fuzziness) || matchUnit(next, 'weight', fuzziness);
        const partAt = skipSemicolons(remainingTokens, unitAt + 1);
        const startsNextPart =
          nextUnit === NEXT_PART[unit] && wordsToNumber(remainingTokens[partAt] ?? '') !== null;
        if (LABEL_ALIASES.has(unit) && nextUnit && !startsNextPart) num = null;
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
    const num = wordsToNumber(tokens.filter(token => token !== ';').join(' '));
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
