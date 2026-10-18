import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { env } from 'node:process';
import { describe, expect, it } from 'vitest';
import { parseMeasurement, type MeasurementType, type ParseOptions, type Unit } from '../src';

// Each property makes a measurement first, writes it in a form that the README or PARSING.md
// shows, and expects the measurement back. So each expected value is a hand calculation from the
// generated parts, and no expected value comes from parseMeasurement.

// Stryker runs each test again for each mutant that it covers, so its workers check fewer inputs.
const NUM_RUNS = env.STRYKER_MUTATOR_WORKER === undefined ? 1000 : 50;
const RUNS = { numRuns: NUM_RUNS, seed: 20261017 };

// The international definitions: 1 in = 2.54 cm, 1 ft = 12 in, 1 m = 100 cm, 1 lb = 0.45359237 kg.
const CM_PER_UNIT: Record<Unit, number> = { in: 2.54, ft: 30.48, cm: 1, m: 100, lb: 0, kg: 0 };
const KG_PER_UNIT: Record<Unit, number> = { lb: 0.45359237, kg: 1, ft: 0, in: 0, cm: 0, m: 0 };
const TYPES: Record<Unit, MeasurementType> = {
  ft: 'height',
  in: 'height',
  cm: 'height',
  m: 'height',
  lb: 'weight',
  kg: 'weight',
};
const UNITS = Object.keys(TYPES) as Unit[];

/** The value in the target unit, from the definitions above. */
function convert(value: number, from: Unit, to: Unit): number {
  const table = TYPES[from] === 'height' ? CM_PER_UNIT : KG_PER_UNIT;
  return (value * table[from]) / table[to];
}

// The names in "Supported Units" in the README, without the marks, which follow other rules.
const NAMES: Record<Unit, readonly string[]> = {
  ft: ['ft', 'feet', 'foot'],
  in: ['in', 'inch', 'inches'],
  cm: ['cm', 'centimeter', 'centimeters', 'centimetre', 'centimetres'],
  m: ['m', 'meter', 'meters', 'metre', 'metres'],
  lb: ['lb', 'lbs', 'pound', 'pounds'],
  kg: ['kg', 'kilo', 'kilos', 'kilogram', 'kilograms'],
};

const ONES = [
  '',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** A number from 1 to 999 in words, as in "one hundred fifty" or "one hundred and fifty". */
function inWords(value: number, and = false): string {
  if (value < 20) return ONES[value];
  if (value < 100) {
    const ones = value % 10;
    return TENS[Math.floor(value / 10)] + (ones ? ` ${ONES[ones]}` : '');
  }
  const rest = value % 100;
  const hundreds = `${ONES[Math.floor(value / 100)]} hundred`;
  return rest ? `${hundreds}${and ? ' and' : ''} ${inWords(rest)}` : hundreds;
}

/** Relative equality, as the corpus uses, so that a conversion's last bit doesn't count. */
function expectValue(actual: number | undefined, expected: number): void {
  expect(actual).toBeTypeOf('number');
  const scale = Math.max(Math.abs(actual ?? 0), Math.abs(expected));
  expect(Math.abs((actual ?? 0) - expected)).toBeLessThanOrEqual(1e-9 * scale);
}

// A positive decimal with at most one decimal place, below 1000 so that it has no thousands group.
const amount = fc.integer({ min: 1, max: 9999 }).map(tenths => tenths / 10);

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
});

describe('generated single measurements', () => {
  const measurement = fc
    .constantFrom(...UNITS)
    .chain(unit => fc.record({ unit: fc.constant(unit), name: fc.constantFrom(...NAMES[unit]) }));

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
    // PARSING.md, "Commas": groups of three digits after one to three digits, and a last group of
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
    // PARSING.md, "Fuzzy Matching": the word starts with the unit name's letter, the errors are
    // fewer than a third of the name's length, names of three characters or fewer and the British
    // spellings match only when exact, and some words never match.
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

describe('generated pairs of measurements', () => {
  // PARSING.md, "More Than One Measurement": the result is the first measurement. The others must
  // agree with it within 1%, or the result is null.
  const PAIRS: readonly (readonly [Unit, Unit])[] = [
    ['kg', 'lb'],
    ['lb', 'kg'],
    ['cm', 'in'],
    ['in', 'cm'],
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
          // at least 3.94 (10 cm in inches), so that is at most 0.13% of it, and the two still
          // disagree by more than 1.8%.
          const other = Math.round(convert(value, first, second) * factor * 100) / 100;
          expect(parseMeasurement(`${value} ${first} (${other} ${second})`)).toBeNull();
        }
      ),
      RUNS
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
});
