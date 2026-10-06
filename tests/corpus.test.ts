import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';
import type { MeasurementType, ParseOptions, ParsedValue, Unit } from '../src/types';

// The corpus is a labelled set of everyday inputs. Each line gives an input and the outputs that
// match what its writer meant. The snapshot of the report below is the parser's committed score.
// See "Measurement corpus" in CONTRIBUTING.md.

const CATEGORIES = [
  'symbols',
  'words',
  'mixed-numbers',
  'decimals',
  'commas',
  'hyphens',
  'compact',
  'unicode',
  'typos',
  'surrounding-text',
  'multiple-measurements',
  'unqualified',
  'conversion',
  'unsupported',
  'prose',
] as const;
type Category = (typeof CATEGORIES)[number];

const OUTCOMES = ['agree', 'wrong', 'missed', 'throws'] as const;
type Outcome = (typeof OUTCOMES)[number];

// The measurement type of each unit, written out here so that the check doesn't use src/.
const UNIT_TYPES: Readonly<Record<Unit, MeasurementType>> = {
  ft: 'height',
  in: 'height',
  cm: 'height',
  m: 'height',
  lb: 'weight',
  kg: 'weight',
};

const UNITS: ReadonlySet<unknown> = new Set(Object.keys(UNIT_TYPES));
const ENTRY_FIELDS = ['id', 'input', 'options', 'expected', 'category', 'source', 'note'];
const OPTION_CHECKS: Readonly<Record<keyof ParseOptions, (value: unknown) => boolean>> = {
  type: value => value === 'height' || value === 'weight',
  fuzziness: value => typeof value === 'number' && Number.isFinite(value) && value >= 0,
  allowUnqualified: value => typeof value === 'boolean',
  inferUnit: value => value === 'metric' || value === 'imperial',
  normalizedUnit: value => UNITS.has(value),
};
const OPTION_CHECK_BY_NAME = new Map(Object.entries(OPTION_CHECKS));
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SOURCE_PATTERN = /^(?:handwritten|AFA-\d+|https:\/\/\S+)$/;
const RELATIVE_TOLERANCE = 1e-9;

interface Measurement {
  value: number;
  unit: Unit | null;
  type: MeasurementType;
}

interface Entry {
  id: string;
  input: string;
  options?: ParseOptions;
  // Every output that the entry accepts. null means that the parser returns null.
  expected: Array<Measurement | null>;
  category: Category;
  source: string;
  note?: string;
}

interface Result {
  entry: Entry;
  outcome: Outcome;
  actual: Measurement | null;
  error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkMeasurement(value: unknown, fail: (message: string) => never): Measurement {
  if (!isRecord(value)) fail('each expected outcome must be null or an object');
  const keys = Object.keys(value).sort().join(',');
  if (keys !== 'type,unit,value') fail('an expected measurement has only value, unit and type');
  const { value: amount, unit, type } = value;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    fail('an expected value must be a positive number');
  }
  if (typeof unit !== 'string' || !UNITS.has(unit)) fail(`unknown unit ${JSON.stringify(unit)}`);
  if (type !== UNIT_TYPES[unit as Unit]) {
    fail(`unit "${unit}" is not a ${String(type)} unit`);
  }
  return { value: amount, unit: unit as Unit, type: type as MeasurementType };
}

function checkOptions(value: unknown, fail: (message: string) => never): ParseOptions {
  if (!isRecord(value)) fail('options must be an object');
  for (const [key, option] of Object.entries(value)) {
    const check = OPTION_CHECK_BY_NAME.get(key);
    if (check === undefined) fail(`unknown option "${key}"`);
    if (!check(option)) fail(`option "${key}" has an invalid value`);
  }
  return value as ParseOptions;
}

function checkEntry(data: unknown, fail: (message: string) => never): Entry {
  if (!isRecord(data)) fail('is not a JSON object');
  for (const key of Object.keys(data)) {
    if (!ENTRY_FIELDS.includes(key)) fail(`unknown field "${key}"`);
  }
  const { id, input, options, expected, category, source, note } = data;
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    fail('id must be lowercase words and digits joined by hyphens');
  }
  if (typeof input !== 'string') fail('input must be a string');
  if (!('expected' in data)) fail('expected is missing');
  if (Array.isArray(expected) && expected.length === 0) fail('expected list is empty');
  const outcomes = Array.isArray(expected) ? expected : [expected];
  if (typeof category !== 'string' || !(CATEGORIES as readonly string[]).includes(category)) {
    fail(`unknown category ${JSON.stringify(category)}`);
  }
  if (typeof source !== 'string' || !SOURCE_PATTERN.test(source)) {
    fail('source must be "handwritten", a ticket ID such as AFA-15, or an https URL');
  }
  if (note !== undefined && typeof note !== 'string') fail('note must be a string');
  return {
    id,
    input,
    ...(options === undefined ? {} : { options: checkOptions(options, fail) }),
    expected: outcomes.map(outcome => (outcome === null ? null : checkMeasurement(outcome, fail))),
    category: category as Category,
    source,
    ...(note === undefined ? {} : { note }),
  };
}

// Reads the JSON Lines text and throws on the first line that is not a valid entry.
function parseCorpus(text: string): Entry[] {
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  const ids = new Set<string>();
  return lines.map((line, index) => {
    const fail: (message: string) => never = message => {
      throw new Error(`corpus line ${index + 1}: ${message}`);
    };
    let data: unknown;
    try {
      data = JSON.parse(line);
    } catch {
      fail('is not valid JSON');
    }
    const entry = checkEntry(data, fail);
    if (ids.has(entry.id)) fail(`duplicate id "${entry.id}"`);
    ids.add(entry.id);
    return entry;
  });
}

function closeTo(actual: number, expected: number): boolean {
  const scale = Math.max(Math.abs(actual), Math.abs(expected));
  return Math.abs(actual - expected) <= RELATIVE_TOLERANCE * scale;
}

function accepts(expected: Measurement | null, actual: Measurement | null): boolean {
  if (expected === null || actual === null) return expected === actual;
  return (
    expected.unit === actual.unit &&
    expected.type === actual.type &&
    closeTo(actual.value, expected.value)
  );
}

function classify(expected: Array<Measurement | null>, actual: Measurement | null): Outcome {
  if (expected.some(outcome => accepts(outcome, actual))) return 'agree';
  return actual === null ? 'missed' : 'wrong';
}

type Parse = (input: string, options?: ParseOptions) => ParsedValue | null;

function run(entry: Entry, parse: Parse = parseMeasurement): Result {
  let parsed: ParsedValue | null;
  try {
    parsed = parse(entry.input, entry.options);
  } catch (error) {
    return { entry, outcome: 'throws', actual: null, error: String(error) };
  }
  const actual = parsed && { value: parsed.value, unit: parsed.unit, type: parsed.type };
  return { entry, outcome: classify(entry.expected, actual), actual };
}

// Shows spaces, invisible characters and dashes that look like a hyphen as escapes.
function quote(text: string): string {
  return JSON.stringify(text).replace(
    /[\u0080-\u00a0\u00ad\u2000-\u2012\u2028-\u202f\u205f-\u206f\u2212\u3000\ufeff]/g,
    character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
}

function show(measurement: Measurement | null): string {
  if (measurement === null) return 'null';
  return `${measurement.value} ${String(measurement.unit)} (${measurement.type})`;
}

function row(label: string, cells: Array<string | number>): string {
  return label.padEnd(22) + cells.map(cell => String(cell).padStart(8)).join('');
}

function countRow(label: string, results: Result[]): string {
  const counts = OUTCOMES.map(outcome => results.filter(result => result.outcome === outcome));
  return row(label, [results.length, ...counts.map(listed => listed.length)]);
}

function buildReport(entries: Entry[], parse: Parse = parseMeasurement): string {
  const results = entries.map(entry => run(entry, parse));
  const lines = [
    row('Category', ['total', ...OUTCOMES]),
    countRow('all', results),
    '',
    ...CATEGORIES.map(category =>
      countRow(
        category,
        results.filter(result => result.entry.category === category)
      )
    ),
  ];
  for (const outcome of OUTCOMES.filter(name => name !== 'agree')) {
    const listed = results.filter(result => result.outcome === outcome);
    lines.push('', `Entries with the outcome "${outcome}" (${listed.length}):`);
    for (const { entry, actual, error } of listed) {
      lines.push(
        '',
        `${entry.id} (${entry.category})`,
        `  input:    ${quote(entry.input)}`,
        `  options:  ${JSON.stringify(entry.options ?? {})}`,
        `  expected: ${entry.expected.map(show).join(' | ')}`,
        `  actual:   ${error === undefined ? show(actual) : `throws ${error}`}`
      );
    }
  }
  // An entry that accepts more than one output can change its output and still agree. The report
  // lists the output of each such entry, so that the snapshot catches that change too.
  const choices = results.filter(
    result => result.outcome === 'agree' && result.entry.expected.length > 1
  );
  lines.push('', `Entries that agree with one of several outputs (${choices.length}):`, '');
  lines.push(...choices.map(({ entry, actual }) => `${entry.id}: ${show(actual)}`));
  return lines.join('\n');
}

const corpus = readFileSync(new URL('./corpus/measurements.jsonl', import.meta.url), 'utf8');

describe('measurement corpus', () => {
  it('has at least 300 valid entries and at least 15 in each category', () => {
    const entries = parseCorpus(corpus);
    expect(entries.length).toBeGreaterThanOrEqual(300);
    const small = CATEGORIES.filter(
      category => entries.filter(entry => entry.category === category).length < 15
    );
    expect(small).toEqual([]);
  });

  it('matches the committed score', () => {
    expect(buildReport(parseCorpus(corpus))).toMatchSnapshot();
  });
});

describe('corpus line checks', () => {
  const valid =
    '{"id":"symbols-1","input":"6 ft","expected":{"value":6,"unit":"ft","type":"height"},' +
    '"category":"symbols","source":"handwritten"}';

  it('reads a valid line', () => {
    expect(parseCorpus(`${valid}\n`)).toEqual([
      {
        id: 'symbols-1',
        input: '6 ft',
        expected: [{ value: 6, unit: 'ft', type: 'height' }],
        category: 'symbols',
        source: 'handwritten',
      },
    ]);
  });

  it('reads a list of outcomes, options and a note', () => {
    const line =
      '{"id":"multiple-1","input":"70 kg (154 lbs)","options":{"fuzziness":1},' +
      '"expected":[{"value":70,"unit":"kg","type":"weight"},null],' +
      '"category":"multiple-measurements","source":"AFA-41","note":"conversion"}';
    expect(parseCorpus(line)).toEqual([
      {
        id: 'multiple-1',
        input: '70 kg (154 lbs)',
        options: { fuzziness: 1 },
        expected: [{ value: 70, unit: 'kg', type: 'weight' }, null],
        category: 'multiple-measurements',
        source: 'AFA-41',
        note: 'conversion',
      },
    ]);
  });

  it.each([
    ['a line that is not JSON', '{"id":', 'corpus line 1: is not valid JSON'],
    ['a line that is not an object', '[]', 'corpus line 1: is not a JSON object'],
    ['a blank line', `${valid}\n\n${valid}`, 'corpus line 2: is not valid JSON'],
    ['a duplicate id', `${valid}\n${valid}`, 'corpus line 2: duplicate id "symbols-1"'],
    [
      'an unknown category',
      valid.replace('"symbols"', '"abbreviations"'),
      'unknown category "abbreviations"',
    ],
    [
      'a unit of the other type',
      valid.replace('"height"', '"weight"'),
      'unit "ft" is not a weight unit',
    ],
    ['an unknown unit', valid.replace('"ft"', '"yd"'), 'unknown unit "yd"'],
    ['an unknown field', valid.replace('"input"', '"text"'), 'unknown field "text"'],
    ['a missing input', valid.replace('"input":"6 ft",', ''), 'input must be a string'],
    ['a missing expected value', valid.replace(/"expected":\{[^}]*\},/, ''), 'expected is missing'],
    ['an empty list of outcomes', valid.replace(/\{"value[^}]*\}/, '[]'), 'expected list is empty'],
    ['a zero value', valid.replace('"value":6', '"value":0'), 'must be a positive number'],
    [
      'an extra measurement field',
      valid.replace('"value":6', '"value":6,"raw":"6 ft"'),
      'has only value, unit and type',
    ],
    ['an id with spaces', valid.replace('symbols-1', 'symbols 1'), 'id must be lowercase'],
    ['an unknown source', valid.replace('handwritten', 'memory'), 'source must be'],
    [
      'an unknown option',
      valid.replace('"expected"', '"options":{"strict":true},"expected"'),
      'unknown option "strict"',
    ],
    [
      'an invalid option value',
      valid.replace('"expected"', '"options":{"type":"length"},"expected"'),
      'option "type" has an invalid value',
    ],
    ['a note that is not text', `${valid.slice(0, -1)},"note":1}`, 'note must be a string'],
  ])('rejects %s', (_, text, message) => {
    expect(() => parseCorpus(text)).toThrow(message);
  });
});

describe('corpus outcomes', () => {
  const kg70: Measurement = { value: 70, unit: 'kg', type: 'weight' };

  it.each([
    ['the same measurement', 'agree', [kg70], kg70],
    ['a value within the tolerance', 'agree', [kg70], { ...kg70, value: 70.00000005 }],
    ['a value outside the tolerance', 'wrong', [kg70], { ...kg70, value: 70.0000002 }],
    ['another unit', 'wrong', [kg70], { value: 70, unit: 'lb', type: 'weight' }],
    ['another type', 'wrong', [kg70], { value: 70, unit: 'kg', type: 'height' }],
    ['a second accepted outcome', 'agree', [null, kg70], kg70],
    ['an accepted null', 'agree', [kg70, null], null],
    ['null for a measurement', 'missed', [kg70], null],
    ['a measurement for null', 'wrong', [null], kg70],
  ] as const)('gives %s the outcome %s', (_, outcome, expected, actual) => {
    expect(classify([...expected], actual)).toBe(outcome);
  });

  it('gives an error the outcome throws and reports its message', () => {
    const [entry] = parseCorpus(
      '{"id":"prose-1","input":"x","expected":null,"category":"prose","source":"handwritten"}'
    );
    const parse = (): never => {
      throw new RangeError('no conversion');
    };
    expect(run(entry, parse)).toEqual({
      entry,
      outcome: 'throws',
      actual: null,
      error: 'RangeError: no conversion',
    });
    expect(buildReport([entry], parse)).toContain('  actual:   throws RangeError: no conversion');
  });
});
