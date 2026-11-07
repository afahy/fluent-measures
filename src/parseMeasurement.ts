import { matchUnit } from './matchUnit';
import { normalize, tokenizeNormalized } from './tokenize';
import { MULTIPLIERS, NUMBER_WORDS, readNumberTokens, type NumberReading } from './wordsToNumber';
import { LABEL_ALIASES, NEXT_PART, UNIT_TYPES, unitConversions } from './units';
import { ParseOptions, ParsedValue, Match, MeasurementType, Unit } from './types';

type QualifiedMatch = Match & { unit: NonNullable<Match['unit']> };
type NumberRead = { value: number | null; end: number; invalidAt?: number; quotedFeet?: boolean };
type Part = QualifiedMatch & { end: number; suffix: boolean; quotedFeet?: boolean };
const CLOSE: Readonly<Record<string, string>> = Object.assign(Object.create(null), {
  '(': ')',
  '[': ']',
  '“': '”',
  '‘': '’',
  '‚': '’',
  '„': '”',
  '”': '”',
  '"': '"',
  "'": "'",
});
const NUMBER_CONNECTORS = new Set(['and', 'a', 'an', 'half', 'point', 'oh', 'o']);
const QUALIFIERS = new Set(['about', 'around', 'roughly', 'approximately', 'approx.']);

/** Read exactly this phrase, never a valid prefix or suffix of an invalid phrase. */
function numberValue(words: string[]): NumberReading {
  let offset = 0;
  if (words[0] === 'a' || words[0] === 'an') {
    if (!NUMBER_WORDS.has(words[1]) && !MULTIPLIERS.has(words[1]))
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
  if (words[words.length - 1] === 'and') return fail(words.length - 1);
  const repeatedAnd = words.findIndex((word, i) => word === 'and' && words[i - 1] === 'and');
  if (repeatedAnd >= 0) return fail(repeatedAnd);
  if (whole.value === null) return fail(whole.invalidAt);
  if (half < 0) return { value: whole.value, invalidAt: words.length + offset };
  if (
    half < 3 ||
    words[half - 1] !== 'a' ||
    words[half - 2] !== 'and' ||
    !Number.isInteger(whole.value)
  )
    return fail(Math.max(0, half - 2));
  let value = whole.value + 0.5;
  let previous = whole.value;
  for (let at = half + 1; at < words.length; at++) {
    const multiplier = MULTIPLIERS.get(words[at]);
    if (!multiplier || multiplier <= previous) return fail(at);
    value *= multiplier;
    previous = multiplier;
  }
  return { value, invalidAt: words.length + offset };
}

function total(parts: QualifiedMatch[], targetUnit: Unit): number {
  let sum = 0;
  for (const { value, unit } of parts) {
    // Conversion arithmetic stays unchanged; AFA-251 owns early option validation and the
    // resulting removal of this late conversion guard.
    if (!value) continue;
    if (unit === targetUnit) {
      sum += value;
      continue;
    }
    const converter = unitConversions[unit][targetUnit];
    if (!converter) throw new Error(`Cannot convert ${unit} to ${targetUnit}`);
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

/** Parse one complete measurement, or select from one complete height/weight pair. */
export function parseMeasurement(input: string, options: ParseOptions = {}): ParsedValue | null {
  if (typeof input !== 'string') return null;
  const { maxLength = 1000 } = options ?? {};
  if (typeof maxLength !== 'number' || !(maxLength >= 1)) {
    throw new Error('maxLength must be a number of at least 1');
  }
  if (input.length > maxLength) return null;
  const trimmed = normalize(input.trim());
  if (!trimmed) return null;
  const tokens = tokenizeNormalized(trimmed);
  if (!tokens.length) return null;
  // Preserve today's option interface/order here. AFA-251 supplies the separately approved
  // early canonical validation and defaultUnit alternative at integration.
  if (options.allowUnqualified && !options.type) throw new Error('allowUnqualified requires type');
  const unitType = options.normalizedUnit && UNIT_TYPES[options.normalizedUnit];
  if (options.type && unitType && unitType !== options.type) {
    throw new Error(`normalizedUnit ${options.normalizedUnit} is not a ${options.type} unit`);
  }
  const onlyType = options.type || unitType;
  const text = (at: number): string => tokens[at]?.text;
  const adjacent = (left: number, right: number): boolean =>
    tokens[left]?.end === tokens[right]?.start;
  const numeric = (word: string): boolean =>
    NUMBER_WORDS.has(word) ||
    MULTIPLIERS.has(word) ||
    NUMBER_CONNECTORS.has(word) ||
    /^[\d.]+$/.test(word);
  const unitAt = (at: number): Unit | null => {
    const word = text(at)?.replace(/\.$/, '');
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
    if (options.type !== 'height' || +shorthand[2] >= 12) return null;
    return result(
      [
        { value: +shorthand[1], unit: 'ft' },
        { value: +shorthand[2], unit: 'in' },
      ],
      input,
      options.normalizedUnit
    );
  }

  function readNumber(start: number, limit: number, quoted = true): NumberRead {
    const close = quoted && CLOSE[text(start)];
    if (close) {
      const inner = readNumber(start + 1, limit, false);
      if (
        inner.value !== null &&
        inner.end < limit &&
        (text(inner.end) === close ||
          (text(start) === '"' && text(inner.end) === '”') ||
          (text(start) === "'" && text(inner.end) === '’'))
      )
        return { value: inner.value, end: inner.end + 1 };
      // normalizeForms distinguishes ‘5’ 11” from a numeric quotation by converting the
      // closing feet mark. Keep that interpretation only if a complete ft/in compound follows.
      if (text(start) === '‘' && text(inner.end) === "'") return { ...inner, quotedFeet: true };
      return { value: null, end: start };
    }
    const words: string[] = [];
    const positions: number[] = [];
    let end = start;
    while (end < limit) {
      const word = text(end);
      if (numeric(word)) {
        // A conjunction before a unit prefix belongs to the part/pair join, not this number.
        if (
          word === 'and' &&
          !numeric(text(end + 1)) &&
          !(
            text(end + 1) === '-' &&
            adjacent(end, end + 1) &&
            adjacent(end + 1, end + 2) &&
            numeric(text(end + 2))
          )
        )
          break;
        positions.push(end);
        words.push(word);
        end++;
      } else if (
        word === '-' &&
        adjacent(end - 1, end) &&
        adjacent(end, end + 1) &&
        numeric(text(end + 1)) &&
        words.length &&
        (!/^[\d.]+$/.test(words[words.length - 1]) || !/^[\d.]+$/.test(text(end + 1)))
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
    const close = text(at) === '(' ? ')' : text(at) === '[' ? ']' : undefined;
    if (close) at++;
    const unit = !prefix && text(at) === '#' && adjacent(at - 1, at) ? 'lb' : unitAt(at);
    if (!unit) return null;
    const alias = text(at++);
    if (close && text(at++) !== close) return null;
    const assignment = text(at) === ':' || text(at) === '=';
    if (prefix && assignment) at++;
    if (
      prefix &&
      (LABEL_ALIASES.has(alias) || alias === "'" || alias === '"') &&
      !close &&
      !assignment
    )
      return null;
    return { unit, end: at };
  }

  function readPart(start: number, limit: number, bareUnit?: Unit): Part | null {
    const quotedNumber = CLOSE[text(start)] ? readNumber(start, limit) : null;
    const prefix = quotedNumber?.value != null ? null : readUnit(start, true);
    if (prefix) {
      const number = readNumber(prefix.end, limit);
      if (number.value !== null)
        return { value: number.value, unit: prefix.unit, end: number.end, suffix: false };
      // A known larger prefix can delimit exactly two complete component numbers, as in
      // "ft 5 11". This is a compound alternative, never recovery from a leftover phrase.
      const split = number.invalidAt;
      if (
        (prefix.unit === 'ft' || prefix.unit === 'm') &&
        split !== undefined &&
        split > prefix.end &&
        split < number.end
      ) {
        const left = readNumber(prefix.end, split);
        const right = readNumber(text(split) === 'and' ? split + 1 : split, number.end);
        if (
          left.value !== null &&
          left.end === split &&
          right.value !== null &&
          right.end === number.end &&
          Number.isInteger(left.value) &&
          right.value > 0 &&
          right.value < unitConversions[prefix.unit][NEXT_PART[prefix.unit]!]!(1)
        ) {
          return { value: left.value, unit: prefix.unit, end: split, suffix: false };
        }
      }
      return null;
    }
    const number = readNumber(start, limit);
    if (number.value === null) return null;
    let at = number.end;
    // An attached word-unit hyphen belongs to the scalar: "5-foot". A sign before a
    // prefix number remains at its cursor and cannot be skipped.
    if (
      text(at) === '-' &&
      adjacent(at - 1, at) &&
      adjacent(at, at + 1) &&
      /^[a-z]/.test(text(at + 1)) &&
      unitAt(at + 1)
    )
      at++;
    const suffix = readUnit(at, false);
    if (suffix)
      return {
        value: number.value,
        unit: suffix.unit,
        end: suffix.end,
        suffix: true,
        quotedFeet: number.quotedFeet,
      };
    return bareUnit && number.value > 0
      ? {
          value: number.value,
          unit: bareUnit,
          end: number.end,
          suffix: false,
          quotedFeet: number.quotedFeet,
        }
      : null;
  }

  function joinAfter(part: Part): { start: number; close?: string; bare: boolean } | null {
    const at = part.end;
    const word = text(at);
    if (word === ';' || word === '/' || word === ':' || word === '=') return null;
    // F3 preserves Unicode height connectors after a comma, including prefix labels.
    // The comma still requires an explicit eligible smaller part; ASCII signs stay signs.
    if (word === ',' && (text(at + 1) === '−' || text(at + 1) === '﹣'))
      return part.unit === 'ft' || part.unit === 'm' ? { start: at + 2, bare: false } : null;
    if (word === ',' || word === 'and') return { start: at + 1, bare: word !== ',' };
    if (word === '(' || word === '[') return { start: at + 1, close: CLOSE[word], bare: false };
    if (/^[\p{Dash}−]$/u.test(word)) {
      // Preserve the supported attached ASCII compound hyphen and Unicode joins. A spaced
      // ASCII minus still signs the following value. Prefix numbers cannot hide ranges.
      return (part.unit === 'ft' || part.unit === 'm') &&
        part.suffix &&
        (word !== '-' || adjacent(at - 1, at))
        ? { start: at + 1, bare: true }
        : null;
    }
    return { start: at, bare: true };
  }

  type Expression = { parsed: ParsedValue; end: number };
  function expression(
    start: number,
    limit: number,
    wrapped = false,
    decorate = true
  ): Expression | null {
    // A whole expression can have one balanced wrapper. A bracketed number or unit label
    // instead belongs to readNumber/readUnit when a following unit/value remains outside it.
    const close = CLOSE[text(start)];
    if (close && !wrapped) {
      let depth = 1;
      for (let at = start + 1; at < limit; at++) {
        if (text(at) === close && --depth === 0) {
          if (!unitAt(at + 1) && text(at + 1) !== ':' && text(at + 1) !== '=') {
            const inner = expression(start + 1, at, true, decorate);
            if (inner && inner.end === at) return { ...inner, end: at + 1 };
          }
          break;
        }
        if (text(at) === text(start) && close !== text(start)) depth++;
      }
    }
    let at = start;
    let namedType: MeasurementType | undefined;
    if (decorate) {
      if (text(at) === "i'm" || text(at) === 'i’m') at++;
      else if (text(at) === 'i' && text(at + 1) === 'am') at += 2;
      else if (text(at) === 'i' && text(at + 1) === 'weigh') {
        namedType = 'weight';
        at += 2;
      } else if (
        text(at) === 'weigh' &&
        (text(at + 1) === 'in' || (text(at + 1) === '-' && text(at + 2) === 'in'))
      ) {
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
    }
    if (at !== start && CLOSE[text(at)]) {
      const inner = expression(at, limit, wrapped, false);
      if (inner && (!namedType || inner.parsed.type === namedType)) return inner;
    }
    const first = readPart(at, limit);
    if (!first || first.end > limit) return null;
    const parts: QualifiedMatch[] = [{ value: first.value, unit: first.unit }];
    let end = first.end;
    const nextUnit = NEXT_PART[first.unit];
    if (nextUnit) {
      const join = joinAfter(first);
      if (join && join.start < limit) {
        const bare =
          join.bare && (first.unit === 'ft' || first.unit === 'm') ? nextUnit : undefined;
        let next = readPart(join.start, limit, bare);
        if (!next && join.close) {
          // A bracket can wrap the number alone when its explicit unit follows outside it.
          next = readPart(first.end, limit);
          if (next) join.close = undefined;
        }
        // "5 ft 11 and 180 lbs" has an explicit pair separator after its bare inches. Both
        // numeric phrases must be complete; no substring is returned when either is invalid.
        if (!next && bare) {
          const split = readNumber(join.start, limit).invalidAt;
          if (split !== undefined && text(split) === 'and') {
            const left = readPart(join.start, split, bare);
            const right = readPart(split + 1, limit);
            if (
              left &&
              left.end === split &&
              right &&
              UNIT_TYPES[right.unit] !== UNIT_TYPES[first.unit]
            )
              next = left;
          }
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
    if (first.quotedFeet && (parts.length !== 2 || first.unit !== 'ft' || parts[1].unit !== 'in'))
      return null;
    const type = UNIT_TYPES[first.unit];
    if (namedType && namedType !== type) return null;
    if (text(end) === 'tall' || text(end) === 'tall.') {
      if (type !== 'height') return null;
      end++;
    }
    if (text(end) === '.' && !text(end - 1).endsWith('.')) end++;
    const parsed = result(
      parts,
      input,
      unitType && unitType !== type ? undefined : options.normalizedUnit
    );
    return parsed ? { parsed, end } : null;
  }

  let begin = 0;
  let limit = tokens.length;
  const outerClose = CLOSE[text(0)];
  if (outerClose && text(limit - 1) === outerClose) {
    let depth = 1;
    for (let at = 1; at < limit; at++) {
      if (text(at) === outerClose && --depth === 0) {
        if (at === limit - 1) {
          begin++;
          limit--;
        }
        break;
      }
      if (text(at) === text(0) && outerClose !== text(0)) depth++;
    }
  }
  const first = expression(begin, limit, begin !== 0);
  if (first) {
    let chosen = first;
    if (first.end !== limit) {
      if (!onlyType) return null;
      const separator = text(first.end);
      const bracket = separator === '(' || separator === '[';
      if (!bracket && ![',', ';', '/', 'and'].includes(separator)) return null;
      const second = expression(first.end + (bracket ? 0 : 1), limit, begin !== 0);
      if (!second || second.end !== limit || second.parsed.type === first.parsed.type) return null;
      if (second.parsed.type === onlyType) chosen = second;
    }
    if (onlyType && chosen.parsed.type !== onlyType) return null;
    return chosen.parsed;
  }

  // A bare default/inference candidate is the whole undecorated number, never leftovers of a
  // failed expression. AFA-251 will replace only the source-unit policy here with defaultUnit.
  if (options.allowUnqualified && options.type) {
    const number = readNumber(0, tokens.length, false);
    if (number.value !== null && number.end === tokens.length) {
      const metric = options.inferUnit === 'metric';
      const unit =
        options.type === 'height'
          ? metric
            ? number.value < 3
              ? 'm'
              : 'cm'
            : 'in'
          : metric
            ? 'kg'
            : 'lb';
      return result([{ value: number.value, unit }], input, options.normalizedUnit);
    }
  }
  return null;
}
