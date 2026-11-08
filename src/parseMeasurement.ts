import { matchUnit } from './matchUnit';
import { normalize, tokenizeNormalized } from './tokenize';
import { MULTIPLIERS, NUMBER_WORDS, readNumberTokens, type NumberReading } from './wordsToNumber';
import { LABEL_ALIASES, NEXT_PART, UNIT_TYPES, unitConversions } from './units';
import { ParseOptions, ParsedValue, Match, MeasurementType, Unit } from './types';

type QualifiedMatch = Match & { unit: NonNullable<Match['unit']> };
type NumberRead = { value: number | null; end: number; invalidAt: number };
type Part = QualifiedMatch & { end: number; suffix?: boolean };
/** The close of a bracket. Quotation marks are feet and inch marks, not wrappers. */
const closeOf = (word: string | undefined): string | undefined =>
  word === '(' ? ')' : word === '[' ? ']' : undefined;
const NUMBER_CONNECTORS = new Set(['and', 'a', 'an', 'half', 'point']);
const QUALIFIERS = new Set(['about', 'around', 'roughly', 'approximately', 'approx.']);
const PAIR_SEPARATORS = new Set([',', ';', '/', 'and', '(', '[']);

/** Read exactly this phrase, never a valid prefix or suffix of an invalid phrase. */
function numberValue(words: string[]): NumberReading {
  const length = words.length;
  let offset = 0;
  if (words[0] === 'a' || words[0] === 'an') {
    if (!NUMBER_WORDS.has(words[1]) && !MULTIPLIERS.has(words[1]))
      // Stryker disable next-line ObjectLiteral: {} yields undefined, which cannot pass compound bounds or produce a positive total (329deb9 mutant 99).
      return { value: null, invalidAt: 0 };
    words = words.slice(1);
    offset = 1;
  }
  const fail = (invalidAt: number): NumberReading => ({
    value: null,
    invalidAt: invalidAt + offset,
  });
  const half = words.indexOf('half');
  const whole = readNumberTokens(half < 0 ? words : words.slice(0, Math.max(0, half - 2)));
  if (!words.length || words[0] === 'and') return fail(0);
  // Keep the earlier numeric boundary for the single compound split; a later conjunction
  // cannot replace it. Each bounded candidate must still pass the structural checks below.
  if (whole.value === null) return fail(whole.invalidAt);
  if (words[words.length - 1] === 'and') return fail(words.length - 1);
  // Stryker disable next-line ArithmeticOperator: either adjacent-and member maps back to the same conjunction-run boundary in readNumber (329deb9 mutant 134).
  const repeatedAnd = words.findIndex((word, i) => word === 'and' && words[i - 1] === 'and');
  if (repeatedAnd >= 0) return fail(repeatedAnd);
  if (half < 0) return { value: whole.value, invalidAt: length };
  // A non-null whole requires at least one token before "and a half", hence half >= 3.
  if (words[half - 1] !== 'a' || words[half - 2] !== 'and' || !Number.isInteger(whole.value))
    return fail(0);
  let value = whole.value + 0.5;
  let previous = whole.value;
  for (let at = half + 1; at < words.length; at++) {
    const multiplier = MULTIPLIERS.get(words[at]);
    if (!multiplier || multiplier <= previous) return fail(at);
    value *= multiplier;
    previous = multiplier;
  }
  return { value, invalidAt: length };
}

function total(parts: QualifiedMatch[], targetUnit: Unit): number {
  let sum = 0;
  for (const { value, unit } of parts) {
    if (!value) continue;
    if (unit === targetUnit) {
      sum += value;
      continue;
    }
    const converter = unitConversions[unit][targetUnit]!;
    sum += converter(value);
  }
  return sum;
}

/** A scalar or compound uses its final written unit unless normalization was requested. */
function result(parts: QualifiedMatch[], input: string, normalizedUnit?: Unit): ParsedValue | null {
  const unit = normalizedUnit || parts[parts.length - 1].unit;
  const value = total(parts, unit);
  return value > 0 && Number.isFinite(value)
    ? { value, unit, type: UNIT_TYPES[parts[0].unit], raw: input, matches: parts }
    : null;
}

/** Read a canonical option unit without coercing an invalid runtime value. */
function unitOption(value: unknown, name: 'defaultUnit' | 'normalizedUnit'): Unit | undefined {
  if (value === undefined || (name === 'normalizedUnit' && (value === null || value === '')))
    return undefined;
  if (typeof value !== 'string' || !UNIT_TYPES[value as Unit]) {
    throw new TypeError(`${name} must be ft, in, cm, m, lb or kg`);
  }
  return value as Unit;
}

/** Parse one complete measurement, or select from one complete height/weight pair. */
export function parseMeasurement(input: string, options: ParseOptions = {}): ParsedValue | null {
  if (typeof input !== 'string') return null;
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }
  const { maxLength = 1000 } = options;
  if (typeof maxLength !== 'number' || !(maxLength >= 1)) {
    throw new Error('maxLength must be a number of at least 1');
  }
  // Validate before string content or length, but never inspect options for non-string input.
  // Empty strings and null type/output values remain absent; source defaults still reject null.
  const rawType: unknown = options.type ?? undefined;
  if (rawType !== undefined && rawType !== '' && rawType !== 'height' && rawType !== 'weight') {
    throw new TypeError('type must be height or weight');
  }
  const requestedType = rawType === '' ? undefined : rawType;
  const normalizedUnit = unitOption(options.normalizedUnit, 'normalizedUnit');
  const defaultUnit = unitOption(options.defaultUnit, 'defaultUnit');
  for (const name of ['allowUnqualified', 'inferUnit'] as const) {
    if ((options as Record<string, unknown>)[name] !== undefined) {
      throw new Error(`${name} was removed; use defaultUnit`);
    }
  }
  const unitType = normalizedUnit && UNIT_TYPES[normalizedUnit];
  if (requestedType && unitType && requestedType !== unitType) {
    throw new Error(`normalizedUnit ${normalizedUnit} is not a ${requestedType} unit`);
  }
  const onlyType = requestedType || unitType;
  if (defaultUnit && onlyType && UNIT_TYPES[defaultUnit] !== onlyType) {
    throw new Error('defaultUnit must match the requested measurement type');
  }
  if (input.length > maxLength) return null;

  const trimmed = normalize(input.trim());
  if (!trimmed) return null;
  const tokens = tokenizeNormalized(trimmed);
  const text = (at: number): string => tokens[at]?.text;
  const adjacent = (left: number, right: number): boolean =>
    tokens[left]?.end === tokens[right]?.start;
  const digitToken = (word: string): boolean => /^[\d.]+$/.test(word);
  const numeric = (word: string): boolean =>
    NUMBER_WORDS.has(word) ||
    MULTIPLIERS.has(word) ||
    NUMBER_CONNECTORS.has(word) ||
    digitToken(word);
  const unitAt = (at: number): Unit | null => {
    const word = text(at)?.replace(/\.$/, '');
    if (word === '′') return 'ft';
    if (word === '″') return 'in';
    return word
      ? matchUnit(word, 'height', options.fuzziness) || matchUnit(word, 'weight', options.fuzziness)
      : null;
  };

  /** Retain whole-entry shorthand as the explicit exception to numeric range rejection. */
  const pieces = trimmed
    .toLowerCase()
    .split('-')
    .map(word => NUMBER_WORDS.get(word));
  const shorthand = (pieces[0]! > 2 && pieces[0]! < 9 ? pieces.join('-') : trimmed).match(
    /^(\d+)-((?:\d*\.)?\d+)$/
  );
  if (shorthand) {
    if (requestedType !== 'height' || +shorthand[2] >= 12) return null;
    return result(
      [
        { value: +shorthand[1], unit: 'ft' },
        { value: +shorthand[2], unit: 'in' },
      ],
      input,
      normalizedUnit
    );
  }

  function readNumber(start: number, limit: number): NumberRead {
    const words: string[] = [];
    const positions: number[] = [];
    let end = start;
    while (end < limit) {
      const word = text(end);
      if (word === '.') break;
      if (numeric(word)) {
        positions.push(end);
        words.push(word);
        end++;
      } else if (
        word === '-' &&
        adjacent(end - 1, end) &&
        adjacent(end, end + 1) &&
        numeric(text(end + 1)) &&
        words.length &&
        (!digitToken(words[words.length - 1]) || !digitToken(text(end + 1)))
      ) {
        // Word hyphens retain ordinary number phrases; digit-to-digit ranges never do.
        end++;
      } else break;
    }
    const reading = numberValue(words);
    let boundary = reading.invalidAt;
    // A conjunction before an invalid next numeric group is a possible explicit join. The
    // candidate parts must each parse completely; it never permits a later retry.
    while (boundary > 0 && words[boundary - 1] === 'and') boundary--;
    return { value: reading.value, end, invalidAt: positions[boundary] ?? end };
  }

  function readUnit(start: number, prefix: boolean): { unit: Unit; end: number } | null {
    let at = start;
    const close = closeOf(text(at));
    if (close) at++;
    const unit = !prefix && text(at) === '#' && adjacent(at - 1, at) ? 'lb' : unitAt(at);
    if (!unit) return null;
    const alias = text(at++);
    if (close && text(at++) !== close) return null;
    const assignment = text(at) === ':' || text(at) === '=';
    if (prefix && assignment) at++;
    if (
      prefix &&
      (LABEL_ALIASES.has(alias) ||
        alias === "'" ||
        alias === '"' ||
        alias === '′' ||
        alias === '″') &&
      !close &&
      !assignment
    )
      return null;
    return { unit, end: at };
  }

  // Retain the original whole bare read; a failed expression must not trigger a second parse.
  // Zero also represents an absent read: result rejects a nonpositive total.
  let bareNumber = 0;

  function readPart(start: number, limit: number, bareUnit?: Unit): Part | null {
    const prefix = readUnit(start, true);
    if (prefix) {
      // The prefix part ends at split. It is a complete phrase or nothing.
      const leftPart = (split: number): Part | null => {
        const left = readNumber(prefix.end, split);
        return left.value === null ? null : { value: left.value, unit: prefix.unit, end: left.end };
      };
      const number = readNumber(prefix.end, limit);
      if (number.value !== null) {
        // A following explicit unit can anchor "m: one and eighty cm" as a compound or
        // "m: one and eighty kg" as a selected pair. The expression/root validate both parts.
        // Unit lookahead has fixed size and consumes nothing. end <= limit keeps the close of
        // a bracketed pair from becoming part of this unit.
        const following = readUnit(number.end, false);
        if (following && following.end <= limit) {
          // A successful number has prefix.end <= number.end. This fixed span advances
          // only by one and returns at the first conjunction; it never retries another split.
          for (let split = prefix.end; split !== number.end; split++) {
            if (text(split) === 'and') return leftPart(split);
          }
        }
        return { value: number.value, unit: prefix.unit, end: number.end };
      }
      // One bounded reread can end a complete prefix part at the first invalid token. The
      // original numeric tokens contain no intervening unit, so a valid left phrase consumes
      // this exact prefix. The expression/root cursors alone validate the compound unit or
      // explicit pair separator and the complete right side.
      return leftPart(number.invalidAt);
    }
    const number = readNumber(start, limit);
    if (number.value === null) return null;
    if (start === 0 && number.end === tokens.length) {
      bareNumber = number.value;
    }
    let at = number.end;
    // An attached word-unit hyphen belongs to the scalar: "5-foot". A sign before a
    // prefix number remains at its cursor and cannot be skipped.
    if (
      text(at) === '-' &&
      adjacent(at - 1, at) &&
      adjacent(at, at + 1) &&
      /[a-z]/.test(text(at + 1)) &&
      unitAt(at + 1)
    )
      at++;
    // A token at or after limit, such as the close of a bracketed pair, is not a suffix unit.
    const suffix = at < limit ? readUnit(at, false) : null;
    if (suffix) return { value: number.value, unit: suffix.unit, end: suffix.end, suffix: true };
    return bareUnit && number.value > 0
      ? { value: number.value, unit: bareUnit, end: number.end }
      : null;
  }

  function joinAfter(part: Part): { start: number; close?: string; bare: boolean } | null {
    const at = part.end;
    const word = text(at);
    // The caller reaches joins only for today's ft/in and m/cm NEXT_PART pairs.
    // A future weight compound must define its own stricter sign/connector eligibility.
    // F3 preserves Unicode height connectors after a comma, including prefix labels.
    // The comma still requires an explicit eligible smaller part; ASCII signs stay signs.
    if (word === ',' && (text(at + 1) === '−' || text(at + 1) === '﹣'))
      return { start: at + 2, bare: false };
    if (word === ',' || word === 'and') return { start: at + 1, bare: word !== ',' };
    const close = closeOf(word);
    if (close) return { start: at + 1, close, bare: false };
    if (/[\p{Dash}−]/u.test(word)) {
      // Preserve the supported attached ASCII compound hyphen and Unicode joins. A spaced
      // ASCII minus still signs the following value. Prefix numbers cannot hide ranges.
      return part.suffix && (word !== '-' || adjacent(at - 1, at))
        ? { start: at + 1, bare: true }
        : null;
    }
    return { start: at, bare: true };
  }

  type Expression = { parsed: ParsedValue; end: number };
  function expression(start: number, limit: number, close?: string): Expression | null {
    // Only the second measurement of a pair can be in brackets, as in "5'11\" (180 lbs)". The
    // caller passes the close of that bracket. A bracketed unit label instead belongs to
    // readUnit when its value follows outside it.
    if (close) {
      let depth = 1;
      // A pair separator comes before the bracket, so start < limit. The fixed-bound cursor
      // advances only by 1.
      for (let at = start + 1; at !== limit; at++) {
        if (text(at) === close) {
          if (--depth === 0) {
            const inner = expression(start + 1, at);
            if (inner && inner.end === at) {
              let end = at + 1;
              const innerLast = text(at - 1);
              const tall = text(end) === 'tall' || text(end) === 'tall.';
              if (tall) {
                // The close does not hide a previous height suffix or terminator.
                if (
                  inner.parsed.type !== 'height' ||
                  innerLast === '.' ||
                  innerLast === 'tall' ||
                  innerLast === 'tall.'
                )
                  return null;
                end++;
              }
              if (
                text(end) === '.' &&
                (tall || !innerLast.endsWith('.')) &&
                !text(end - 1).endsWith('.')
              )
                end++;
              return { ...inner, end };
            }
            break;
          }
        }
        if (text(at) === text(start)) depth++;
      }
    }
    let at = start;
    let namedType: MeasurementType | undefined;
    if (text(at) === "i'm" || text(at) === 'i’m') at++;
    else if (text(at) === 'i' && text(at + 1) === 'am') at += 2;
    else if (text(at) === 'i' && text(at + 1) === 'weigh') {
      namedType = 'weight';
      at += 2;
    } else if (text(at) === 'weigh' && (text(at + 1) === 'in' || text(at + 2) === 'in')) {
      at += text(at + 1) === '-' ? 3 : 2;
      if (text(at++) !== ':') return null;
      namedType = 'weight';
    } else {
      if (text(at) === 'my') at++;
      if (text(at) === 'height' || text(at) === 'weight') {
        namedType = text(at++) as MeasurementType;
        if (text(at) === 'is' || text(at) === ':' || text(at) === '=') at++;
      } else if (at !== start) return null;
    }
    if (QUALIFIERS.has(text(at))) at++;
    const first = readPart(at, limit);
    if (!first || first.end > limit) return null;
    const parts: QualifiedMatch[] = [{ value: first.value, unit: first.unit }];
    let end = first.end;
    const nextUnit = NEXT_PART[first.unit];
    if (nextUnit) {
      const join = joinAfter(first);
      // At the excluded close/end, the bounded readers return no numeric part.
      if (join) {
        const bare = join.bare ? nextUnit : undefined;
        let next = readPart(join.start, limit, bare);
        if (!next && join.close) {
          // The bracket can be a unit label before the smaller part, as in "5 ft (in) 11".
          next = readPart(first.end, limit);
          join.close = undefined;
        }
        // "5 ft 11 and 180 lbs" has an explicit pair separator after its bare inches. Both
        // numeric phrases must be complete; no substring is returned when either is invalid.
        if (!next) {
          const split = readNumber(join.start, limit).invalidAt;
          // A phrase with no numbers ends at join.start, an empty candidate. A numeric-only
          // candidate without bare eligibility has no unit. The root still requires an explicit
          // pair separator and a complete second expression, so an arbitrary invalid numeric
          // token cannot join.
          next = readPart(join.start, split, bare);
        }
        if (
          next &&
          next.end <= limit &&
          next.unit === nextUnit &&
          Number.isInteger(first.value) &&
          next.value < unitConversions[first.unit][nextUnit]!(1) &&
          (!join.close || text(next.end) === join.close)
        ) {
          parts.push({ value: next.value, unit: next.unit });
          end = next.end + (join.close ? 1 : 0);
        }
      }
    }
    const type = UNIT_TYPES[first.unit];
    if (namedType && namedType !== type) return null;
    if (text(end) === 'tall' || text(end) === 'tall.') {
      if (type !== 'height') return null;
      end++;
    }
    if (text(end) === '.' && !text(end - 1).endsWith('.')) end++;
    const parsed = result(parts, input, unitType && unitType !== type ? undefined : normalizedUnit);
    return parsed ? { parsed, end } : null;
  }

  const limit = tokens.length;
  const first = expression(0, limit);
  if (first) {
    let chosen = first;
    if (first.end !== limit) {
      if (!onlyType) return null;
      const separator = text(first.end);
      const bracket = closeOf(separator);
      if (!PAIR_SEPARATORS.has(separator)) return null;
      // Brackets around the second measurement also separate a pair.
      const second = expression(first.end + (bracket ? 0 : 1), limit, bracket);
      if (!second || second.end !== limit || second.parsed.type === first.parsed.type) return null;
      if (second.parsed.type === onlyType) chosen = second;
    }
    if (onlyType && chosen.parsed.type !== onlyType) return null;
    return chosen.parsed;
  }

  // Only the original complete, undecorated, unwrapped number can use the source default.
  if (defaultUnit) {
    return result([{ value: bareNumber, unit: defaultUnit }], input, normalizedUnit);
  }
  return null;
}
