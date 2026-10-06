import { matchUnit } from './matchUnit';
import {
  normalizeForms,
  normalizeFractions,
  normalizeNumericCommas,
  tokenizeNormalized,
} from './tokenize';
import { NUMBER_WORDS, wordsToNumber } from './wordsToNumber';

import {
  FIELD_MARK,
  LABEL_ALIASES,
  NAME_MARK,
  NEXT_PART,
  UNIT_ALIASES,
  UNIT_MARK,
  UNSUPPORTED_WEIGHT_UNITS,
  unitConversions,
} from './units';

import { ParseOptions, ParsedValue, Match, Unit } from './types';

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

/** Add up a measurement's parts in the target unit. */
function total(parts: QualifiedMatch[], targetUnit: Unit): number {
  let sum = 0;
  for (const { value, unit } of parts) {
    // Zero components contribute nothing, including across measurement types.
    if (!value) continue;
    if (unit === targetUnit) {
      sum += value;
      continue;
    }
    const converter = unitConversions[unit][targetUnit];
    if (!converter) {
      throw new Error(`Cannot convert ${unit} to ${targetUnit}`);
    }
    sum += converter(value);
  }
  return sum;
}

/**
 * Return the index of the first token at or after `start` that isn't a semicolon or a unit label's
 * mark. A field mark ends the search, because a new field starts there, unless `field` is true.
 */
function skipMarks(tokens: string[], start: number, field?: boolean): number {
  while (
    tokens[start] === ';' ||
    tokens[start] === UNIT_MARK ||
    (field && tokens[start] === FIELD_MARK)
  ) {
    start++;
  }
  return start;
}

/**
 * Read the number phrase after a unit, as before one, so "kg one hundred eighty" is 180 kg.
 * Return a null value when there's no number, or when the unit is a label and can't take it.
 */
function readValueAfter(
  tokens: string[],
  start: number,
  unit: Unit,
  label: boolean,
  fuzziness?: number
): [value: number | null, end: number] {
  const [value, end] = readNumberPhrase(tokens, skipMarks(tokens, start));
  // A label doesn't take a number that has its own unit, as in "weigh in: 180 lbs" and
  // "180 lbs = 82 kg", even an unsupported one, as in "kg=400 g", so the check for stone, ounces
  // and grams still sees that part. A semicolon or a unit label's mark can come between a number
  // and its unit, as in "180; lbs" and "180 (lbs), 82 (kg)". But a unit with its own number after
  // it doesn't own the number when it starts the next part of the measurement, as in
  // "m: 1 cm: 80", or when it's another label, as in "kg: 72 cm: 180". The short aliases are
  // labels even when spelled out.
  const unitAt = skipMarks(tokens, end);
  const next = tokens[unitAt] ?? '';
  const nextUnit = matchUnit(next, 'height', fuzziness) || matchUnit(next, 'weight', fuzziness);
  const ownUnit =
    (label || LABEL_ALIASES.has(unit)) &&
    (nextUnit || UNSUPPORTED_WEIGHT_UNITS.test(next)) &&
    !(
      (nextUnit === NEXT_PART[unit] || tokens[unitAt - 1] === UNIT_MARK) &&
      wordsToNumber(tokens[skipMarks(tokens, unitAt + 1)] ?? '') !== null
    );
  return [ownUnit ? null : value, end];
}

/** Parse a height or weight, optionally inferring its unit or normalizing the result. */
export function parseMeasurement(input: string, options: ParseOptions = {}): ParsedValue | null {
  // Stryker disable next-line StringLiteral: the replacement "Stryker was here!" also returns null.
  const trimmed = normalizeFractions(normalizeNumericCommas(normalizeForms(input?.trim() || '')));
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
  // normalizedUnit selects the measurement type, so { normalizedUnit: 'kg' } reads only a weight.
  const unitType = (['height', 'weight'] as const).find(type =>
    UNIT_ALIASES[type].some(([unit]) => unit === options.normalizedUnit)
  );
  if (tokens.length && options.type && unitType && unitType !== options.type) {
    throw new Error(`normalizedUnit ${options.normalizedUnit} is not a ${options.type} unit`);
  }
  const onlyType = options.type ?? unitType;

  // Two number words work too when the feet are 3 to 8, so "five-eleven" is "5-11". A part that
  // isn't one number word, digits included, joins as an empty string, so the pattern doesn't match.
  const parts = trimmed
    .toLowerCase()
    .split('-')
    .map(word => NUMBER_WORDS.get(word));
  const shorthand = (parts[0]! > 2 && parts[0]! < 9 ? parts.join('-') : trimmed).match(
    /^(\d+)-((?:\d*\.)?\d+)$/
  );
  if (shorthand) {
    // Bare N-M is ambiguous unless the caller explicitly requests a height. Feet too large to
    // represent return null when the measurement is read.
    if (options.type !== 'height' || +shorthand[2] >= 12) return null;
    // Feed the components through the same parser as explicit feet and inches.
    tokens = [shorthand[1], 'ft', shorthand[2], 'in'];
  }

  for (const type of onlyType ? [onlyType] : (['height', 'weight'] as const)) {
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
          // Reading backward already skips semicolons, so skip them reading forward too, as in
          // "8 oz; 7 lb" and "12 st 4;lb". Commas don't separate parts, so skip field marks too,
          // as in "Stone: 12, lb: 4".
          const skip = (start: number): number => skipMarks(tokens, start, true);
          const [after, afterEnd] = readNumberPhrase(tokens, skip(i + 1));
          const unitAt = skip(afterEnd);
          // A supported part before it can have its unit first, as in "kg 3, 400 g". Earlier
          // matches blank their tokens, so check the original tokens for a unit.
          const partEndsAt = (end: number): boolean =>
            isWeightUnit(tokens[readNumberPhrase(tokens, end, -1)[1]]);
          // With no number before it, the unit can come before its number, as in "stone 12, 4 lb",
          // unless a weight unit after that number takes it, as in "stone, 50 lb bag". A unit with
          // its own number after it doesn't, as in "Stone: 12, lb: 4". Like "in" and "m", "st"
          // and "g" before a number are usually other words, as in "Main St 12".
          if (
            before === null
              ? after !== null &&
                word !== 'st' &&
                word !== 'g' &&
                !(
                  isWeightUnit(tokens[unitAt]) &&
                  readNumberPhrase(tokens, skip(unitAt + 1))[0] === null
                ) &&
                (partEndsAt(i - 1) ||
                  isWeightUnit(tokens[skip(readNumberPhrase(tokens, unitAt)[1])]))
              : !(word === 'st' && /^(?:\d*[02-9])?1$/.test(remainingTokens[i - 1])) &&
                (partEndsAt(beforeEnd) || isWeightUnit(tokens[unitAt]))
          ) {
            return null;
          }
        }
        continue;
      }

      // Read the preceding phrase first, allowing ordinary punctuation before its unit. A label's
      // value comes after it, as in "age=28, in=72", so a label skips this when its value follows.
      // For a field name, a short alias before ":" or "=", that's any number. Any other label can
      // also be the unit of the number before it, as in "(in)", "in." and "kg:", so its value must
      // be a number it can take, including a zero. Otherwise a label reads the number before its
      // mark, as in "72 in: height", "72 (in), 180 lbs" and "180 lbs = 82 kg", unless a field
      // separator comes between them.
      const mark = remainingTokens[i - 1];
      const label = mark === NAME_MARK || mark === UNIT_MARK;
      const valueFollows =
        mark === NAME_MARK
          ? readNumberPhrase(remainingTokens, skipMarks(remainingTokens, i + 1))[0] !== null
          : label && readValueAfter(remainingTokens, i + 1, unit, label, fuzziness)[0] !== null;
      let [num, end]: [number | null, number] = valueFollows
        ? [null, i - 1]
        : readNumberPhrase(remainingTokens, label ? i - 2 : i - 1, -1);
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
        const [value, valueEnd] = readValueAfter(remainingTokens, matchEnd, unit, label, fuzziness);
        num = value || null;
        matchStart = i;
        matchEnd = valueEnd;
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

    // Inferred units use the same normalization and result handling as explicit units.
    const inferred = !matches.length && options.allowUnqualified && options.type;
    if (inferred) {
      const num = wordsToNumber(tokens.filter(token => token !== ';').join(' '));
      // Stryker disable next-line ConditionalExpression: num > 0 is false for null too.
      if (num !== null && num > 0) {
        const metric = options.inferUnit === 'metric';
        const unit = type === 'height' ? (metric ? 'cm' : 'in') : metric ? 'kg' : 'lb';
        matches.push({ value: num, unit });
      }
    }

    // If we found any matches for this type
    if (matches.length) {
      // Parts form one measurement only while each unit is the next smaller one, the larger part
      // is a whole number and the smaller part is less than one of the larger unit, as in
      // "5 ft 11 in". Any other part starts a separate measurement, as in "70 kg (154 lbs)",
      // "6 ft (72 in)" or "0.5 m (50 cm)".
      const measurements: QualifiedMatch[][] = [];
      for (const match of matches) {
        const last = measurements[measurements.length - 1];
        const previous = last?.[last.length - 1];
        if (
          previous &&
          Number.isInteger(previous.value) &&
          NEXT_PART[previous.unit] === match.unit &&
          match.value < unitConversions[previous.unit][match.unit]!(1)
        ) {
          last.push(match);
        } else {
          measurements.push([match]);
        }
      }
      // A measurement that adds up to zero doesn't count, as in "0 feet; actual 1.8 meters".
      const counted = measurements.filter(parts => parts.some(({ value }) => value));
      const first = counted[0] ?? measurements[0];

      // Use the unit of the last part, unless normalization is requested. A measurement with
      // several parts is a height, so its last part is the smallest: inches in "5 ft 11 in" and
      // centimeters in "1 m 80 cm".
      const targetUnit = options.normalizedUnit || first[first.length - 1].unit;
      const totalValue = total(first, targetUnit);

      // A zero-height fragment must not hide a valid measurement of another type. An inferred
      // value is the only measurement, so it stays even when its conversion underflows to zero.
      if (!totalValue && !inferred) continue;
      // A number too large to represent, such as 400 digits, has no usable value.
      if (!Number.isFinite(totalValue)) return null;

      // Another measurement is fine only as the same value written another way, within 1%. The
      // tiny margin keeps an exact 1% after floating-point rounding, which makes 1.01 - 1 a little
      // more than 0.01.
      const limit = (totalValue / 100) * (1 + 1e-9);
      if (counted.some(parts => Math.abs(total(parts, targetUnit) - totalValue) > limit)) {
        return null;
      }

      return {
        value: totalValue,
        unit: targetUnit,
        type,
        raw: input,
        matches: first,
      };
    }
  }

  return null;
}
