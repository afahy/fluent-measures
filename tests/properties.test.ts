import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { env } from 'node:process';
import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions, type Unit } from '../src';
import {
  convert,
  inWords,
  NAMES,
  NUMBER_FORMS,
  PLACEMENTS,
  TYPES,
  UNITS,
  writeInteger,
  writeMeasurement,
  type Quantity,
} from './measurementModel';

// Each property makes a measurement first, writes it in a form that the README or PARSING.md
// shows, and expects the measurement back. So each expected value is a hand calculation from the
// generated parts, and no expected value comes from parseMeasurement.

// Stryker runs each test again for each mutant that it covers, so its workers check fewer inputs.
const NUM_RUNS = env.STRYKER_MUTATOR_WORKER === undefined ? 1000 : 50;
const RUNS = { numRuns: NUM_RUNS, seed: 20261017 };
const SEMANTIC_RUNS = {
  numRuns: env.STRYKER_MUTATOR_WORKER === undefined ? 250 : 25,
  seed: 20261104,
};

/** Relative equality, as the corpus uses, so that a conversion's last bit doesn't count. */
function expectValue(actual: number | undefined, expected: number): void {
  expect(actual).toBeTypeOf('number');
  const scale = Math.max(Math.abs(actual ?? 0), Math.abs(expected));
  expect(Math.abs((actual ?? 0) - expected)).toBeLessThanOrEqual(1e-9 * scale);
}

// A positive decimal with at most one decimal place, below 1000 so that it has no thousands group.
const amount = fc.integer({ min: 1, max: 9999 }).map(tenths => tenths / 10);
const whole = fc.integer({ min: 1, max: 999 });
const measurement = fc
  .constantFrom(...UNITS)
  .chain(unit => fc.record({ unit: fc.constant(unit), name: fc.constantFrom(...NAMES[unit]) }));

function targets(unit: Unit): Unit[] {
  return UNITS.filter(target => TYPES[target] === TYPES[unit]);
}

/** Compare the full meaning, including the original parts, with an independent unit oracle. */
function expectQuantity(
  raw: string,
  quantity: Quantity,
  options: ParseOptions = {},
  matches: Quantity[] = [quantity]
): void {
  const unit = options.normalizedUnit ?? quantity.unit;
  const expected = convert(quantity.value, quantity.unit, unit);
  const result = parseMeasurement(raw, options);
  expect(result).toMatchObject({ unit, type: TYPES[unit], raw });
  expect(result?.matches).toEqual(matches);
  // At most a few multiplies/divides on bounded normal values. 32 machine epsilons cover their
  // rounding order, while staying far below any generated quantity difference or the 1% rule.
  expect(result?.value).toBeTypeOf('number');
  expect(Math.abs((result?.value ?? NaN) - expected)).toBeLessThanOrEqual(
    32 * Number.EPSILON * Math.abs(expected)
  );
}

describe('generated feet and inches', () => {
  // README: "A height in feet and inches gives the total in inches". PARSING.md, "More Than One
  // Measurement": the feet are a whole number and the inches are less than 12. The second column
  // is the smallest inches value. Inches with no unit after them, after a feet word, start at 1,
  // because tests/parseMeasurement.bareInches.test.ts reads "5 ft 0" as 5 ft. The shorthand has
  // no unit at all and starts at 0, because tests/parseMeasurement.hyphens.test.ts reads "5-0" as
  // 60 in.
  const forms: readonly (readonly [string, number, (feet: number, inches: number) => string])[] = [
    ['marks', 0, (feet, inches): string => `${feet}'${inches}"`],
    ['marks with a space', 0, (feet, inches): string => `${feet}' ${inches}"`],
    ['short names', 0, (feet, inches): string => `${feet} ft ${inches} in`],
    ['long names', 0, (feet, inches): string => `${feet} feet ${inches} inches`],
    ['hyphens between words', 1, (feet, inches): string => `${feet}-foot-${inches}`],
    ['a hyphen after ft', 1, (feet, inches): string => `${feet} ft-${inches}`],
    ['a hyphen between marks', 0, (feet, inches): string => `${feet}'-${inches}"`],
    ['shorthand', 0, (feet, inches): string => `${feet}-${inches}`],
  ];

  it.each(forms)('reads the total in inches from %s', (_, fewest, write) => {
    expect.hasAssertions();
    const inchesPart = fc.integer({ min: fewest, max: 11 });
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 8 }), inchesPart, (feet, inches) => {
        const raw = write(feet, inches);
        // PARSING.md, "Shorthand": a hyphen between two numbers needs type 'height'.
        expect(parseMeasurement(raw, { type: 'height' })).toEqual({
          value: feet * 12 + inches,
          unit: 'in',
          type: 'height',
          matches: [
            { value: feet, unit: 'ft' },
            { value: inches, unit: 'in' },
          ],
          raw,
        });
      }),
      RUNS
    );
  });

  it('reads feet and inches in words', () => {
    expect.hasAssertions();
    // README: "five feet eleven inches", and "five foot ten" with type 'height'.
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 1, max: 11 }),
        fc.boolean(),
        (feet, inches, short) => {
          const raw = short
            ? `${inWords(feet)} foot ${inWords(inches)}`
            : `${inWords(feet)} feet ${inWords(inches)} inches`;
          const result = parseMeasurement(raw, { type: 'height' });
          expect(result?.unit).toBe('in');
          expect(result?.value).toBe(feet * 12 + inches);
        }
      ),
      RUNS
    );
  });

  // PARSING.md, "More Than One Measurement", and unitFirstPhrases.test.ts: both unit systems
  // have compounds, including unit-first fields. The smaller part is below the next unit.
  it.each([
    ['ft', 'in', 12],
    ['m', 'cm', 100],
  ] as const)('keeps and normalizes compound %s and %s', (large, small, radix) => {
    expect.hasAssertions();
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 1, max: radix - 1 }),
        fc.constantFrom(...NUMBER_FORMS),
        fc.constantFrom('suffix' as const, 'colon' as const),
        fc.constantFrom(...targets(large)),
        (larger, smaller, form, placement, normalizedUnit) => {
          const parts = [
            { value: larger, unit: large },
            { value: smaller, unit: small },
          ];
          const raw = parts
            .map(part => writeMeasurement(writeInteger(part.value, form), part.unit, placement))
            .join(' ');
          const total = { value: larger * radix + smaller, unit: small };
          expectQuantity(raw, total, {}, parts);
          expectQuantity(raw, total, { normalizedUnit }, parts);
        }
      ),
      SEMANTIC_RUNS
    );
  });
});

describe('generated single measurements', () => {
  it('reads the value and the unit of each unit name', () => {
    expect.hasAssertions();
    // README, "Supported Units". PARSING.md: after a number, "in" and "m" are units.
    fc.assert(
      fc.property(amount, measurement, fc.boolean(), (value, { unit, name }, space) => {
        const raw = `${value}${space ? ' ' : ''}${name}`;
        const result = parseMeasurement(raw);
        expect(result?.unit).toBe(unit);
        expect(result?.type).toBe(TYPES[unit]);
        expect(result?.value).toBe(value);
      }),
      RUNS
    );
  });

  it('converts the value to normalizedUnit', () => {
    expect.hasAssertions();
    // README: "Set normalizedUnit to convert the result to one unit".
    const target = measurement.chain(found =>
      fc.record({
        found: fc.constant(found),
        to: fc.constantFrom(...UNITS.filter(unit => TYPES[unit] === TYPES[found.unit])),
      })
    );
    fc.assert(
      fc.property(amount, target, (value, { found, to }) => {
        const result = parseMeasurement(`${value} ${found.name}`, { normalizedUnit: to });
        expect(result?.unit).toBe(to);
        expectValue(result?.value, convert(value, found.unit, to));
      }),
      RUNS
    );
  });

  it('reads only the type that normalizedUnit selects', () => {
    // README, ParseOptions: normalizedUnit "also selects the measurement type, so a weight unit
    // reads only a weight".
    expect.hasAssertions();
    const otherType = measurement.chain(found =>
      fc.record({
        found: fc.constant(found),
        to: fc.constantFrom(...UNITS.filter(unit => TYPES[unit] !== TYPES[found.unit])),
      })
    );
    fc.assert(
      fc.property(amount, otherType, (value, { found, to }) => {
        expect(parseMeasurement(`${value} ${found.name}`, { normalizedUnit: to })).toBeNull();
      }),
      RUNS
    );
  });

  it('reads a number in words', () => {
    expect.hasAssertions();
    // README: "eighty kilograms" and "one hundred fifty pounds". PARSING.md, "Numbers".
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 999 }),
        measurement,
        fc.boolean(),
        (value, found, and) => {
          const raw = `${inWords(value, and)} ${found.name}`;
          const result = parseMeasurement(raw, { type: TYPES[found.unit] });
          expect(result?.unit).toBe(found.unit);
          expect(result?.value).toBe(value);
        }
      ),
      RUNS
    );
  });

  it('reads thousands groups and a decimal comma', () => {
    expect.hasAssertions();
    // PARSING.md, "Commas": groups of three digits come after one to three digits. A last group of
    // one or two digits is a decimal part, as in "1,234,56 kg".
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 9_999_999 }),
        fc.option(fc.integer({ min: 1, max: 99 }), { nil: undefined }),
        fc.constantFrom<Unit>('kg', 'lb', 'cm'),
        (whole, hundredths, unit) => {
          const grouped = whole.toLocaleString('en-US');
          const decimals =
            hundredths === undefined ? '' : `,${String(hundredths).padStart(2, '0')}`;
          const result = parseMeasurement(`${grouped}${decimals} ${unit}`);
          expect(result?.unit).toBe(unit);
          expectValue(result?.value, whole + (hundredths ?? 0) / 100);
        }
      ),
      RUNS
    );
  });

  it('reads a unit name with one spelling error only with fuzziness', () => {
    expect.hasAssertions();
    // PARSING.md, "Fuzzy Matching": the word starts with the unit name's letter. The errors are
    // fewer than a third of the name's length. Names of three characters or fewer and the British
    // spellings match only when exact. Some words never match.
    // The words that never match come from PARSING.md, the specification. A fix that stops
    // another word from matching adds it to that list, and this test follows the list.
    const never = /The words ([^.]*) never match/.exec(readFileSync('PARSING.md', 'utf8'))?.[1];
    const NEVER = new Set([...(never ?? '').matchAll(/`([a-z]+)`/g)].map(([, word]) => word));
    expect([...NEVER]).toContain('food');
    const LONG_NAMES = UNITS.flatMap(unit =>
      NAMES[unit]
        .filter(name => name.length > 3 && !name.includes('tre'))
        .map(name => ({ unit, name }))
    );
    const EXACT = new Set(UNITS.flatMap(unit => NAMES[unit]));
    const misspelled = fc
      .record({
        found: fc.constantFrom(...LONG_NAMES),
        edit: fc.constantFrom('change', 'add', 'remove'),
        at: fc.nat(),
        letter: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'),
      })
      .map(({ found, edit, at, letter }) => {
        // The first letter stays the same. An added letter can also go after the last one.
        const position = 1 + (at % (found.name.length - (edit === 'add' ? 0 : 1)));
        const before = found.name.slice(0, position);
        const after = found.name.slice(position);
        const word =
          edit === 'add'
            ? before + letter + after
            : before + (edit === 'change' ? letter : '') + after.slice(1);
        return { ...found, word };
      })
      .filter(({ word }) => !EXACT.has(word) && !NEVER.has(word));
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 300 }), misspelled, (value, { unit, word }) => {
        const raw = `${value} ${word}`;
        const options: ParseOptions = { type: TYPES[unit] };
        expect(parseMeasurement(raw, options)).toBeNull();
        const result = parseMeasurement(raw, { ...options, fuzziness: 1 });
        expect(result?.unit).toBe(unit);
        expect(result?.value).toBe(value);
      }),
      RUNS
    );
  });
});

describe('generated number phrases', () => {
  // PARSING.md, "Numbers" and "Units Before a Number"; unitFirstPhrases.test.ts. Each placement
  // runs independently, including under Stryker, so prefix/label coverage isn't left to chance.
  it.each(PLACEMENTS)('reads and normalizes the whole phrase with a %s unit', placement => {
    expect.hasAssertions();
    fc.assert(
      fc.property(
        fc.integer({ min: 21, max: 999 }),
        measurement,
        fc.constantFrom(...NUMBER_FORMS),
        (value, { unit, name }, form) => {
          const raw = writeMeasurement(writeInteger(value, form), name, placement);
          expectQuantity(raw, { value, unit });
          for (const normalizedUnit of targets(unit)) {
            expectQuantity(raw, { value, unit }, { normalizedUnit });
          }
        }
      ),
      SEMANTIC_RUNS
    );
  });

  // fractions.test.ts: mixed proper fractions and Unicode fractions. Powers of two give exact
  // finite decimals; this writer doesn't broaden the contract to exponent-form fractions.
  it.each(['suffix', 'prefix'] as const)('reads proper fractions with a %s unit', placement => {
    expect.hasAssertions();
    const fraction = fc.constantFrom(2, 4, 8, 16).chain(denominator =>
      fc.record({
        denominator: fc.constant(denominator),
        numerator: fc.integer({ min: 1, max: denominator - 1 }),
      })
    );
    fc.assert(
      fc.property(
        whole,
        fraction,
        measurement,
        (integer, { numerator, denominator }, { unit, name }) => {
          const value = integer + numerator / denominator;
          expectQuantity(
            writeMeasurement(`${integer} ${numerator}/${denominator}`, name, placement),
            { value, unit }
          );
        }
      ),
      SEMANTIC_RUNS
    );
  });

  it.each([
    ['¼', 0.25],
    ['½', 0.5],
    ['¾', 0.75],
  ] as const)('reads the Unicode fraction %s', (mark, fraction) => {
    expect.hasAssertions();
    fc.assert(
      fc.property(whole, measurement, (integer, { unit, name }) => {
        expectQuantity(`${integer}${mark} ${name}`, { value: integer + fraction, unit });
      }),
      SEMANTIC_RUNS
    );
  });

  // andAHalf.test.ts: a whole number plus a half, then increasing multipliers. Only the suffix
  // form has the multiplier contract; a forward read can stop at the half (see that test).
  it.each([
    ['', 1],
    [' hundred', 100],
    [' thousand', 1000],
    [' hundred thousand', 100_000],
  ] as const)('multiplies the whole number and half by%s', (multiplier, factor) => {
    expect.hasAssertions();
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 9 }),
        measurement,
        fc.boolean(),
        (integer, { unit, name }, words) => {
          const phrase = `${words ? inWords(integer) : integer} and a half${multiplier}`;
          expectQuantity(`${phrase} ${name}`, { value: (integer + 0.5) * factor, unit });
        }
      ),
      SEMANTIC_RUNS
    );
  });

  // signedParts.test.ts: a sign on the first number word, including a/an, signs the whole phrase.
  it.each(['-', '−', '﹣'])('rejects a whole signed phrase starting with %s', sign => {
    expect.hasAssertions();
    fc.assert(
      fc.property(
        whole,
        measurement,
        fc.constantFrom('suffix' as const, 'prefix' as const, 'colon' as const),
        (value, { name }, placement) => {
          for (const phrase of [inWords(value), 'a hundred', 'an eighty']) {
            expect(
              parseMeasurement(writeMeasurement(`${sign}${phrase}`, name, placement))
            ).toBeNull();
          }
        }
      ),
      SEMANTIC_RUNS
    );
  });
});

describe('generated label ownership', () => {
  // PARSING.md, "Labels", unitLabels.test.ts and labelValues.test.ts. A preceding field can
  // change independently of the measurement, in digits or words and with each supported label.
  it.each([', ', '; ', '&', ': ', '= ', ' '])(
    'keeps the label value after delimiter %j',
    delimiter => {
      expect.hasAssertions();
      fc.assert(
        fc.property(
          whole,
          whole,
          measurement,
          fc.constantFrom(...NUMBER_FORMS),
          fc.constantFrom('colon' as const, 'equals' as const, 'brackets' as const),
          (previous, value, { unit, name }, form, placement) => {
            const label = writeMeasurement(writeInteger(value, form), name, placement);
            expectQuantity(`age=${previous}${delimiter}${label}`, { value, unit });
            expectQuantity(`age=${previous + 1}${delimiter}${label}`, { value, unit });
          }
        ),
        SEMANTIC_RUNS
      );
    }
  );

  // A delimiter blocks fallback to the previous field if the label's value has its own unit.
  it.each([', ', '; ', '&', ': ', '= '])(
    'gives a value its own unit after delimiter %j',
    delimiter => {
      expect.hasAssertions();
      fc.assert(
        fc.property(
          whole,
          whole,
          measurement,
          measurement,
          fc.constantFrom(...NUMBER_FORMS),
          fc.constantFrom('colon' as const, 'equals' as const, 'brackets' as const),
          (previous, value, label, own, form, placement) => {
            const text = writeMeasurement(
              `${writeInteger(value, form)} ${own.name}`,
              label.name,
              placement
            );
            expectQuantity(`id=${previous}${delimiter}${text}`, { value, unit: own.unit });
            expectQuantity(`id=${previous + 1}${delimiter}${text}`, { value, unit: own.unit });
          }
        ),
        SEMANTIC_RUNS
      );
    }
  );

  // With no delimiter, ordinary labels fall back to the preceding value. Explicit types keep
  // both dimensions observable, rather than letting the parser's default selection hide one.
  it.each([
    ['kg:', 'kg', 'cm'],
    ['ft:', 'ft', 'kg'],
    ['(in)', 'in', 'lb'],
    ['in.', 'in', 'lb'],
    ['(m)', 'm', 'kg'],
  ] as const)('keeps the preceding quantity for label %s', (label, unit, ownUnit) => {
    expect.hasAssertions();
    fc.assert(
      fc.property(whole, whole, fc.constantFrom(...NUMBER_FORMS), (previous, value, form) => {
        const raw = `${previous} ${label} ${writeInteger(value, form)} ${ownUnit}`;
        expectQuantity(raw, { value: previous, unit }, { type: TYPES[unit] });
        expectQuantity(raw, { value, unit: ownUnit }, { type: TYPES[ownUnit] });
      }),
      SEMANTIC_RUNS
    );
  });

  // in/m before : or = are field names, which don't take the preceding value in this case.
  it.each(['in:', 'in=', '(in):', 'm:', 'm=', '(m):'])(
    'keeps field name %s from taking the previous value',
    label => {
      expect.hasAssertions();
      fc.assert(
        fc.property(whole, whole, fc.constantFrom(...NUMBER_FORMS), (previous, value, form) => {
          const raw = `${previous} ${label} ${writeInteger(value, form)} lbs`;
          expectQuantity(raw, { value, unit: 'lb' });
          expect(parseMeasurement(raw, { type: 'height' })).toBeNull();
        }),
        SEMANTIC_RUNS
      );
    }
  );
});

describe('generated pairs of measurements', () => {
  // PARSING.md, "More Than One Measurement": the result is the first measurement. The others must
  // agree with it within 1%, or the result is null.
  const PAIRS: readonly (readonly [Unit, Unit])[] = [
    ['kg', 'lb'],
    ['lb', 'kg'],
    ['cm', 'in'],
    ['in', 'cm'],
    ['ft', 'in'],
    ['m', 'cm'],
  ];

  it('gives the first measurement when the second agrees', () => {
    expect.hasAssertions();
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 300 }),
        fc.constantFrom(...PAIRS),
        (value, [first, second]) => {
          // Two decimal places keep the second value within 0.15% of the first for values from 10.
          const other = Math.round(convert(value, first, second) * 100) / 100;
          const result = parseMeasurement(`${value} ${first} (${other} ${second})`);
          expect(result?.unit).toBe(first);
          expect(result?.value).toBe(value);
          expect(result?.type).toBe(TYPES[first]);
          expect(result?.matches).toEqual([{ value, unit: first }]);
          for (const normalizedUnit of targets(first)) {
            expectQuantity(
              `${value} ${first} (${other} ${second})`,
              { value, unit: first },
              { normalizedUnit }
            );
          }
        }
      ),
      RUNS
    );
  });

  it('gives null when the second disagrees by more than 1%', () => {
    expect.hasAssertions();
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 300 }),
        fc.constantFrom(...PAIRS),
        fc.integer({ min: 2, max: 50 }),
        fc.boolean(),
        (value, [first, second], percent, higher) => {
          const factor = higher ? 1 + percent / 100 : 1 - percent / 100;
          // Rounding to two decimal places moves `other` by at most 0.005. The converted value is
          // at least 3.94 (10 cm in inches), so that is at most 0.13% of it. The two still
          // disagree by more than 1.8%.
          const other = Math.round(convert(value, first, second) * factor * 100) / 100;
          expect(parseMeasurement(`${value} ${first} (${other} ${second})`)).toBeNull();
        }
      ),
      RUNS
    );
  });

  // The first quantity is 100*k and the difference is k. These integers make exactly 1%, with
  // no rounded conversion at the boundary. 1/1024 is exact in binary and much larger than float
  // error here (k <= 1000), so the inside/outside cases cannot cross the boundary by rounding.
  it.each([0, 1 / 1024])('accepts agreement at or inside one percent by %s', inside => {
    expect.hasAssertions();
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        fc.constantFrom(...UNITS),
        fc.constantFrom(-1, 1),
        (k, unit, direction) => {
          const value = 100 * k;
          const other = value + direction * (k - inside);
          expectQuantity(`${value} ${unit} (${other} ${unit})`, { value, unit });
        }
      ),
      SEMANTIC_RUNS
    );
  });

  it('rejects agreement just outside 1%', () => {
    expect.hasAssertions();
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        fc.constantFrom(...UNITS),
        fc.constantFrom(-1, 1),
        (k, unit, direction) => {
          const value = 100 * k;
          const other = value + direction * (k + 1 / 1024);
          expect(parseMeasurement(`${value} ${unit} (${other} ${unit})`)).toBeNull();
        }
      ),
      SEMANTIC_RUNS
    );
  });
});

describe('generated numbers with no unit', () => {
  it('reads a weight in the unit of inferUnit', () => {
    expect.hasAssertions();
    // README: allowUnqualified reads a number that has no unit, and inferUnit selects the unit
    // system. A weight has one unit in each system.
    fc.assert(
      fc.property(
        amount,
        fc.constantFrom('metric' as const, 'imperial' as const),
        (value, system) => {
          const result = parseMeasurement(String(value), {
            type: 'weight',
            allowUnqualified: true,
            inferUnit: system,
          });
          expect(result?.unit).toBe(system === 'metric' ? 'kg' : 'lb');
          expect(result?.value).toBe(value);
        }
      ),
      RUNS
    );
  });

  // README, allowUnqualified; unqualifiedMeters.test.ts supplies the metric height boundary:
  // below 3 means meters, from 3 means centimeters. Generate the source meaning in each domain,
  // rather than asking the parser which unit it inferred. No subnormal/underflow cases (AFA-107).
  it.each([
    ['height', 'metric', 'm', 1, 299, 100],
    ['height', 'metric', 'cm', 300, 9999, 100],
    ['height', 'imperial', 'in', 1, 9999, 10],
    ['weight', 'metric', 'kg', 1, 9999, 10],
    ['weight', 'imperial', 'lb', 1, 9999, 10],
  ] as const)('normalizes inferred %s in %s %s', (type, inferUnit, unit, min, max, divisor) => {
    expect.hasAssertions();
    fc.assert(
      fc.property(fc.integer({ min, max }), numerator => {
        const value = numerator / divisor;
        for (const normalizedUnit of targets(unit)) {
          const options = { type, normalizedUnit };
          expectQuantity(
            String(value),
            { value, unit },
            { ...options, inferUnit, allowUnqualified: true }
          );
          expectQuantity(`${value} ${unit}`, { value, unit }, options);
          expect(parseMeasurement(String(value), options)).toBeNull();
        }
      }),
      // Ensure both ends, particularly 2.99 m and 3 cm, also run in mutation workers.
      { ...SEMANTIC_RUNS, examples: [[min], [max]] }
    );
  });
});

describe('generated normalized type selection', () => {
  // README ParseOptions and unitConversions.test.ts: normalizedUnit chooses the dimension even
  // in mixed text, in either order. A conflicting explicit type throws, and inference needs type.
  it.each(UNITS)('selects and converts only the dimension of %s', normalizedUnit => {
    expect.hasAssertions();
    const selectedUnits = targets(normalizedUnit);
    const otherUnits = UNITS.filter(unit => TYPES[unit] !== TYPES[normalizedUnit]);
    fc.assert(
      fc.property(
        whole,
        whole,
        fc.constantFrom(...selectedUnits),
        fc.constantFrom(...otherUnits),
        fc.constantFrom(...NUMBER_FORMS),
        fc.boolean(),
        (value, otherValue, unit, otherUnit, form, reverse) => {
          const fields = [
            `${writeInteger(value, form)} ${unit}`,
            `${writeInteger(otherValue, form)} ${otherUnit}`,
          ];
          const raw = (reverse ? fields.reverse() : fields).join(', ');
          expectQuantity(raw, { value, unit }, { normalizedUnit });
          expectQuantity(raw, { value, unit }, { normalizedUnit, type: TYPES[unit] });
          expect(() => parseMeasurement(raw, { normalizedUnit, type: TYPES[otherUnit] })).toThrow(
            `normalizedUnit ${normalizedUnit} is not a ${TYPES[otherUnit]} unit`
          );
          expect(() =>
            parseMeasurement(String(value), { normalizedUnit, allowUnqualified: true })
          ).toThrow('allowUnqualified requires type');
        }
      ),
      SEMANTIC_RUNS
    );
  });
});

describe('generated numeric fuzziness boundaries', () => {
  // fuzzyUnits.test.ts and features/fuzzy-matching.md. The second column is the allowed number
  // of edits, independently specified here, not calculated by production option handling.
  it.each([
    [Infinity, 0],
    [-Infinity, 0],
    [NaN, 0],
    [0, 0],
    [-0, 0],
    [-1, 0],
    [-0.5, 0],
    [Number.MIN_VALUE, 0],
    [0.5, 0],
    [1 - Number.EPSILON, 0],
    [1, 1],
    [1.5, 1],
    [2 - Number.EPSILON, 1],
    [2, 2],
  ])('allows the specified edits with fuzziness %s', (fuzziness, edits) => {
    expect.hasAssertions();
    fc.assert(
      fc.property(amount, measurement, (value, { unit, name }) => {
        expectQuantity(`${value} ${name}`, { value, unit }, { fuzziness });
        // "foots" adds s to foot; "kilgrm" deletes o and a from kilogram. Each is unambiguous
        // and satisfies the name-length and first-letter rules in PARSING.md.
        for (const [word, typoUnit, distance] of [
          ['foots', 'ft', 1],
          ['kilgrm', 'kg', 2],
        ] as const) {
          const raw = `${value} ${word}`;
          const expected =
            edits >= distance
              ? {
                  value,
                  unit: typoUnit,
                  type: TYPES[typoUnit],
                  raw,
                  matches: [{ value, unit: typoUnit }],
                }
              : null;
          expect(parseMeasurement(raw, { fuzziness })).toEqual(expected);
        }
      }),
      SEMANTIC_RUNS
    );
  });
});
