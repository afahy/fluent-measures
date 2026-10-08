import { matchUnit } from './matchUnit';
import { normalize, Token, tokenizeNormalized } from './tokenize';
import { MULTIPLIERS, NUMBER_WORDS, wordsToNumber } from './wordsToNumber';

import {
  LABEL_ALIASES,
  NEXT_PART,
  UNIT_TYPES,
  UNSUPPORTED_WEIGHT_UNITS,
  unitConversions,
} from './units';

import { ParseOptions, ParsedValue, Match, MeasurementType, Unit } from './types';

type QualifiedMatch = Match & { unit: NonNullable<Match['unit']> };

/**
 * Reads the text of the token at an index, or undefined past either end, as an array does. Each
 * reader takes one, so it can read the tokens with or without the ones that a match has used.
 */
type Words = (at: number) => string;

/** Read the tokens as if each one that a match has used were "", so no other match can use it. */
const remainingWords =
  (tokens: Token[]): Words =>
  at =>
    tokens[at]?.used ? '' : tokens[at]?.text;

/**
 * Read the longest adjacent number phrase and return its first unconsumed token index. With
 * `readHalf` false, a phrase that ends in "and a half" isn't read.
 */
function readNumberPhrase(
  words: Words,
  start: number,
  step = 1,
  readHalf = true
): [value: number | null, end: number] {
  // "and a half" after a whole number adds 0.5, as in "six and a half feet" and
  // "5 foot 10 and a half". Number.isInteger is false for null.
  const half = (at: number): boolean =>
    words(at) === 'and' && words(at + 1) === 'a' && words(at + 2) === 'half';
  // Reading backward, the phrase can start at "half", or at the multiplier words after it. They
  // multiply the half, as in "two and a half thousand" (2500) and "two and a half hundred
  // thousand" (250,000). As in "two hundred thousand", each multiplier must be smaller than the one
  // after it, and the whole number must be smaller than the nearest one. Semicolons are skipped, as
  // the loop below skips them.
  //
  // A number before "and a half" that can't take it leaves no number, not only the multipliers, as
  // in "1.5 and a half thousand". A signed one leaves no number too, and the read stops at its
  // sign, so readSignedPhrase finds it there, as in "-2 and a half thousand".
  //
  // A read forward doesn't do this, so it stops before a multiplier after "and a half". The whole
  // number before "and a half" can't end in another "and a half", so that read doesn't check for
  // one. Then a long run of "and a half" doesn't read back one call deeper each time.
  // Stryker disable next-line EqualityOperator: step is 1 or -1, so "step <= 0" is the same.
  if (readHalf && step < 0) {
    let at = start;
    let multiplier = 1;
    let nearest = Infinity;
    let ordered = true;
    for (; words(at) === ';' || MULTIPLIERS.has(words(at)); at--) {
      const next = MULTIPLIERS.get(words(at));
      if (!next) continue;
      ordered &&= next < nearest;
      multiplier *= nearest = next;
    }
    if (half(at - 2)) {
      const [whole, end, signed] = readSignedPhrase(words, at - 3, -1, false);
      if (signed) return [null, end + 1];
      if (ordered && Number.isInteger(whole) && whole! < nearest) {
        return [(whole! + 0.5) * multiplier, end];
      }
      if (whole !== null) return [null, at];
    }
  }
  let end = start;
  let value: number | null = null;
  const phrase: string[] = [];
  for (; words(end) !== undefined; end += step) {
    const word = words(end);
    if (word === 'and' || (step < 0 && word === ';')) continue;
    if (step > 0) phrase.push(word);
    else phrase.unshift(word);
    const candidate = wordsToNumber(phrase.join(' '));
    if (candidate === null) break;
    value = candidate;
  }
  // Reading forward, the loop skips "and" and stops at "a". A read backward never stops just
  // before "a half", because "half" isn't a number.
  return Number.isInteger(value) && half(end - 1) ? [value! + 0.5, end + 2] : [value, end];
}

/**
 * Whether a word is a stone, ounce or gram unit after the number token before it. "st" after a
 * whole number that ends in 1, except 11, is an ordinal, as in "Oct 1st", but "10.1st" is stone.
 */
const isUnsupportedUnit = (word: string, number: string): boolean =>
  UNSUPPORTED_WEIGHT_UNITS.test(word) && !(word === 'st' && /^-*(?:\d*[02-9])?1$/.test(number));

/**
 * Read a number phrase as readNumberPhrase does, but let minus signs start its first word, as in
 * "-5" and "--12". They sign the whole phrase, as in "-twenty five" and "-a hundred", so `signed`
 * is true, and the value doesn't include them. A sign before another word doesn't count. Reading
 * forward, the first word is at `start`. Reading backward, it's the word where readNumberPhrase
 * stops, and `end` is the token before it.
 */
function readSignedPhrase(
  words: Words,
  start: number,
  step = 1,
  readHalf = true
): [value: number | null, end: number, signed: boolean] {
  const [value, end] = readNumberPhrase(words, start, step, readHalf);
  // Stryker disable next-line EqualityOperator: step is 1 or -1, so "step >= 0" is the same.
  const forward = step > 0;
  const at = forward ? start : end;
  const token = words(at);
  if (!token?.startsWith('-')) return [value, end, false];
  // Stryker disable next-line Regex: the token starts with a minus sign, so "/-+/" removes the same signs.
  const word = token.replace(/^-+/, '');
  if (word === 'a' || word === 'an') {
    // "a" and "an" add nothing to the value, but a sign on them signs the number words right
    // after them. Digits don't take them, as in "-a 12 lb" (12 lb), and a semicolon after them
    // ends the phrase, as in "-a; hundred kg" (100 kg).
    const next = words(at + 1);
    if (NUMBER_WORDS.has(next) || MULTIPLIERS.has(next)) {
      return forward ? [...readNumberPhrase(words, at + 1), true] : [value, at - 1, true];
    }
  } else if (wordsToNumber(word) !== null) {
    // Read again with the word in place of the token.
    const [signedValue, signedEnd] = readNumberPhrase(
      index => (index === at ? word : words(index)),
      start,
      step,
      readHalf
    );
    // Reading backward, the word must join the phrase, so "-5 12 kg" is 12 kg. The phrase then
    // starts at the signed word, as after "a" and "an".
    if (signedEnd !== at) return [signedValue, forward ? signedEnd : at - 1, true];
  }
  return [value, end, false];
}

/** Add up a measurement's parts in the target unit. */
function total(parts: QualifiedMatch[], targetUnit: Unit): number {
  let sum = 0;
  for (const { value, unit } of parts) {
    // Zero components contribute nothing.
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

/** Return the index of the first token at or after `start` that isn't a semicolon. */
function skipSemicolons(words: Words, start: number): number {
  while (words(start) === ';') start++;
  return start;
}

/**
 * Read the number phrase after a unit, as before one, so "kg one hundred eighty" is 180 kg.
 * Return a null value when there's no number, or when the unit is a label and can't take it.
 * `label` is also true for a unit right after a zero, which can't take a number either.
 */
function readValueAfter(
  tokens: Token[],
  start: number,
  unit: Unit,
  label: boolean,
  fuzziness?: number
): [value: number | null, end: number] {
  const words = remainingWords(tokens);
  // This read takes a signed value too, so the check for a label's value finds it, as in "kg: -5".
  const [value, end] = readSignedPhrase(words, skipSemicolons(words, start));
  // A label doesn't take a number that has its own unit, as in "weigh in: 180 lbs" and
  // "180 lbs = 82 kg", even an unsupported one, as in "kg=400 g", so the check for stone, ounces
  // and grams still sees that part. A semicolon or a unit label can be that unit, as in
  // "180; lbs" and "180 (lbs), 82 (kg)", but a field name or a label that starts a field can't. A
  // unit with its own number after it doesn't own the number when it starts the next part of the
  // measurement, as in "m: 1 cm: 80", or when it's another label, as in "kg: 72 cm: 180". The
  // short aliases are labels even when spelled out.
  const unitAt = skipSemicolons(words, end);
  const nextToken = tokens[unitAt];
  // Stryker disable next-line StringLiteral: no unit is named "Stryker was here!", so it's no unit, as "" is.
  const next = (nextToken?.label !== 'name' && !nextToken?.startsField && words(unitAt)) || '';
  const nextUnit = matchUnit(next, 'height', fuzziness) || matchUnit(next, 'weight', fuzziness);
  const ownUnit =
    (label || LABEL_ALIASES.has(unit)) &&
    (nextUnit || UNSUPPORTED_WEIGHT_UNITS.test(next)) &&
    !(
      (nextUnit === NEXT_PART[unit] || nextToken.label === 'unit') &&
      // Stryker disable next-line StringLiteral: "Stryker was here!" isn't a number, as "" isn't.
      wordsToNumber(words(skipSemicolons(words, unitAt + 1)) ?? '') !== null
    );
  return [ownUnit ? null : value, end];
}

/**
 * Whether the token at `i` is a stone, ounce or gram unit whose number stands next to a supported
 * weight part, as in "12st 4lb" or "7 lb 8 oz". That part would leave the weight incomplete. An
 * unrelated amount elsewhere, as in "8 oz of water", doesn't count. Earlier matches use their
 * tokens, which `remaining` reads as "", so the check reads units in `text`, which reads them all.
 */
function hasUnsupportedPart(text: Words, remaining: Words, i: number, fuzziness?: number): boolean {
  const word = remaining(i);
  if (!UNSUPPORTED_WEIGHT_UNITS.test(word)) return false;
  // Stryker disable next-line StringLiteral: a missing token and "Stryker was here!" are both no weight unit.
  const isWeightUnit = (token = ''): boolean => matchUnit(token, 'weight', fuzziness) !== null;
  // A signed number here reads as its value without the sign. A minus sign doesn't make
  // the part unrelated, as in "-12st 4lb", "-12;st 4lb", "stone -12, 4 lb" and
  // "12 lb -twenty five oz".
  const [before, beforeEnd] = readSignedPhrase(remaining, i - 1, -1);
  // Reading backward already skips semicolons, so skip them reading forward too, as in
  // "8 oz; 7 lb" and "12 st 4;lb". Commas don't separate parts, so a label that starts a field
  // can be a part's unit, as in "Stone: 12, lb: 4".
  const skip = (start: number): number => skipSemicolons(text, start);
  const next = skip(i + 1);
  const [after, afterEnd] = readSignedPhrase(text, next);
  const unitAt = skip(afterEnd);
  // A supported part before it can have its unit first, as in "kg 3, 400 g". Earlier
  // matches use their tokens, so check all the tokens for a unit.
  const partEndsAt = (end: number): boolean =>
    isWeightUnit(text(readNumberPhrase(text, end, -1)[1]));
  // With no number before it, the unit can come before its number, as in "stone 12, 4 lb",
  // unless a weight unit after that number takes it, as in "stone, 50 lb bag". A unit with
  // its own number after it doesn't, as in "Stone: 12, lb: 4". Like "in" and "m", "st"
  // and "g" before a number are usually other words, as in "Main St 12".
  return before === null
    ? after !== null &&
        word !== 'st' &&
        word !== 'g' &&
        !(isWeightUnit(text(unitAt)) && readNumberPhrase(text, skip(unitAt + 1))[0] === null) &&
        (partEndsAt(i - 1) || isWeightUnit(text(skip(readNumberPhrase(text, unitAt)[1]))))
    : isUnsupportedUnit(word, remaining(i - 1)) &&
        (partEndsAt(beforeEnd) || isWeightUnit(text(unitAt)));
}

/**
 * Group the parts into measurements, and give the first one's total if the others agree with it.
 * Return null when they don't, or when the total is too large to represent: the parse fails.
 * Return undefined when the first measurement adds up to zero, so the parser goes on to the
 * next type.
 */
function combineParts(
  matches: QualifiedMatch[],
  type: MeasurementType,
  input: string,
  normalizedUnit: Unit | undefined,
  inferred: boolean
): ParsedValue | null | undefined {
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

  // Use normalizedUnit, or else the unit of the last part. A measurement with several parts
  // is a height, so its last part is the smallest: inches in "5 ft 11 in" and centimeters in
  // "1 m 80 cm".
  const targetUnit = normalizedUnit || first[first.length - 1].unit;
  const totalValue = total(first, targetUnit);

  // A zero-height fragment must not hide a valid measurement of another type. An inferred
  // value is the only measurement, so it stays even when its conversion underflows to zero.
  if (!totalValue && !inferred) return undefined;
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

/** Parse a height or weight, optionally inferring its unit or normalizing the result. */
export function parseMeasurement(input: string, options: ParseOptions = {}): ParsedValue | null {
  // Stryker disable next-line StringLiteral: the replacement "Stryker was here!" also returns null.
  const trimmed = normalize(input?.trim() || '');
  if (!trimmed) {
    return null;
  }

  // Replace whole ranges with a boundary so neither endpoint becomes a measurement.
  // Preserve semicolon boundaries so independent fields cannot form a compound height.
  const fuzziness = options.fuzziness;
  let tokens = tokenizeNormalized(
    trimmed.replace(/(?<![\d.])[\d.]+(?:\s*\p{Dash}\s*[\d.]+)+/gu, ' - '),
    fuzziness
  );
  if (tokens.length && options.allowUnqualified && !options.type) {
    throw new Error('allowUnqualified requires type');
  }
  // normalizedUnit selects the measurement type, so { normalizedUnit: 'kg' } reads only a weight.
  const unitType = options.normalizedUnit && UNIT_TYPES[options.normalizedUnit];
  if (tokens.length && options.type && unitType && unitType !== options.type) {
    throw new Error(`normalizedUnit ${options.normalizedUnit} is not a ${options.type} unit`);
  }
  const onlyType = options.type || unitType;

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
    tokens = [shorthand[1], 'ft', shorthand[2], 'in'].map(text => ({ text }));
  }

  // Each token's field: a semicolon starts a new one, as in "invalid -5 ft; actual 180 cm".
  let field = 0;
  // Stryker disable next-line UpdateOperator: each field only needs a number that differs from the others'.
  const fieldOf = tokens.map(({ text }) => (text === ';' ? ++field : field));
  const text: Words = at => tokens[at]?.text;
  const remaining = remainingWords(tokens);
  /** Mark the tokens from `start` up to `end` as used. */
  const use = (start: number, end: number): void => {
    for (let at = start; at < end; at++) tokens[at].used = true;
  };

  for (const type of onlyType ? [onlyType] : (['height', 'weight'] as const)) {
    let matches: QualifiedMatch[] = [];
    // Each type reads all the tokens again.
    for (const token of tokens) token.used = false;
    // A measurement can't be negative. A signed part, as in "-5 ft" or "kg -5", drops each part of
    // its type in its field. So the rest of that field can't decide the result, as in "-5 ft 6 ft".
    const signedFields = new Set<number>();
    const matchFields = new Map<QualifiedMatch, number[]>();

    // Process tokens looking for units and numbers
    for (let i = 0; i < tokens.length; i++) {
      const unit = matchUnit(remaining(i), type, fuzziness);
      if (!unit) {
        if (type === 'weight' && hasUnsupportedPart(text, remaining, i, fuzziness)) {
          return null;
        }
        continue;
      }

      // Read the preceding phrase first, allowing ordinary punctuation before its unit. A label's
      // value comes after it, as in "age=28, in=72", so a label skips this when its value follows.
      // For a field name, a short alias before ":" or "=", that's any number. Any other label can
      // also be the unit of the number before it, as in "(in)", "in." and "kg:", so its value must
      // be a number it can take, including a zero. Otherwise a label reads the number before it,
      // as in "72 in: height", "72 (in), 180 lbs" and "180 lbs = 82 kg", unless it starts a field.
      const { label: kind, startsField } = tokens[i];
      const label = kind !== undefined;
      // A signed value after a label is its value too, so the check for a sign below finds it.
      // As for a value without a sign, one with its own unit isn't, as in "180 cm = -82 kg".
      const valueAt = skipSemicolons(remaining, i + 1);
      const valueSigned = readSignedPhrase(remaining, valueAt)[2];
      const signedValue = label && valueSigned;
      // A field name takes any number after it, but not a signed one with its own unit, as in
      // "72 in: -180 lbs".
      const valueFollows =
        kind === 'name' && !signedValue
          ? readNumberPhrase(remaining, valueAt)[0] !== null
          : label && readValueAfter(tokens, i + 1, unit, label, fuzziness)[0] !== null;
      // A sign on the first word of a phrase signs the whole phrase, as in "-twenty five kg" and
      // "-a hundred kg". So those inputs return null, as "-5 feet" does.
      // When the value follows, or the label starts a field, the read before the unit takes nothing,
      // and the match starts at the unit.
      let [num, end, signed]: [number | null, number, boolean] =
        valueFollows || startsField ? [null, i, false] : readSignedPhrase(remaining, i - 1, -1);
      let matchStart = num === null ? end : end + 1;
      let matchEnd = i + 1;

      // A semicolon can come between a number and its unit, as in "-5;feet", so both fields go.
      if (signed) {
        signedFields.add(fieldOf[matchStart]).add(fieldOf[i]);
        continue;
      }

      // A semicolon can also separate a unit prefix from its value. Short aliases such as "in"
      // are words before a number ("in 2020"), so only their spelled-out labels are prefixes.
      if (
        !num &&
        (num === null || unit !== 'ft' || (!label && remaining(i - 1) === ';')) &&
        !LABEL_ALIASES.has(remaining(i))
      ) {
        // A label's signed value with its own unit isn't the label's value, as in
        // "in: -180 lbs, 72 in", so it doesn't drop the label's field. Its own unit drops its field.
        if (valueSigned && (!signedValue || valueFollows)) {
          signedFields.add(fieldOf[i]).add(fieldOf[valueAt]);
          continue;
        }
        // After a zero in the same field, the unit doesn't take a number that has its own unit, as a
        // label doesn't, so "0 cm, 1.8 m" is 1.8 m. The zero is then the unit's own number. A zero
        // in an earlier field isn't the unit's, as in "record 0; kg 70 lb", which is 70 kg.
        const [value, valueEnd] = readValueAfter(
          tokens,
          matchEnd,
          unit,
          label || (num === 0 && fieldOf[matchStart] === fieldOf[i]),
          fuzziness
        );
        num = value || null;
        matchStart = i;
        matchEnd = valueEnd;
      }

      if (num === null) {
        continue;
      }

      const match = { value: num, unit };
      matches.push(match);
      // A number and its unit can stand in two fields, as in "180;lbs".
      matchFields.set(match, [fieldOf[matchStart], fieldOf[matchEnd - 1]]);

      use(matchStart, matchEnd);

      if (unit === 'ft') {
        const [inches, inchesEnd] = readNumberPhrase(remaining, matchEnd);
        // A label's value comes after it, so a label isn't the unit of the inches before it.
        // Stryker disable next-line StringLiteral: "Stryker was here!" is no unit, as "" is.
        const nextWord = (!tokens[inchesEnd]?.label && remaining(inchesEnd)) || '';
        const nextUnit = matchUnit(nextWord, 'height', fuzziness);
        // A following unit owns the number, even when it belongs to another measurement type or
        // isn't supported, as in "5 ft 8 oz".
        if (
          inches !== null &&
          (nextUnit === 'in' ||
            (inches > 0 &&
              inches < 12 &&
              !nextUnit &&
              !matchUnit(nextWord, 'weight', fuzziness) &&
              !isUnsupportedUnit(nextWord, remaining(inchesEnd - 1))))
        ) {
          const inchesMatch: QualifiedMatch = { value: inches, unit: 'in' };
          // The inches' number starts at matchEnd, and reading forward stops at a semicolon.
          matchFields.set(inchesMatch, [fieldOf[matchEnd]]);
          // Stryker disable next-line ConditionalExpression: "true" keeps zero parts, which add up to zero and don't count. The tests kill "false".
          if (num || inches) matches.push(inchesMatch);
          else matches.pop();
          use(matchEnd, inchesEnd + (nextUnit === 'in' ? 1 : 0));
        } else if (!num) {
          // An isolated zero must not change the unit of an independent measurement.
          matches.pop();
        }
      }
    }

    matches = matches.filter(match => matchFields.get(match)!.every(at => !signedFields.has(at)));

    // Inferred units use the same normalization and result handling as explicit units.
    const inferred = !matches.length && options.allowUnqualified && options.type;
    if (inferred) {
      const num = wordsToNumber(
        tokens
          .map(({ text }) => text)
          .filter(text => text !== ';')
          .join(' ')
      );
      // Stryker disable next-line ConditionalExpression: num > 0 is false for null too.
      if (num !== null && num > 0) {
        const metric = options.inferUnit === 'metric';
        // A metric height below 3 can only be meters, as in "1.75", because no one is 3 cm tall.
        const unit =
          type === 'height' ? (metric ? (num < 3 ? 'm' : 'cm') : 'in') : metric ? 'kg' : 'lb';
        matches.push({ value: num, unit });
      }
    }

    if (matches.length) {
      const result = combineParts(matches, type, input, options.normalizedUnit, Boolean(inferred));
      if (result !== undefined) return result;
    }
  }

  return null;
}
