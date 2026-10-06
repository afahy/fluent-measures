import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';
import type { ParseOptions, ParsedValue } from '../src/types';
import { UNIT_ALIASES } from '../src/units';
import { wordsToNumber } from '../src/wordsToNumber';

const README = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

/** The parts of a result that a README example documents. `null` means the example returns null. */
type Expected = ({ value: number } & Partial<Omit<ParsedValue, 'value'>>) | null;

interface ReadmeExample {
  /** The README heading that the example is under. */
  section: string;
  input: string;
  options?: ParseOptions;
}

interface ReadmeCase extends ReadmeExample {
  expected: Expected;
  /**
   * The README's result comment, only for an example whose result comment is prose or missing.
   * A code comment above the case then names the source of `expected`.
   */
  readmeComment?: string | null;
}

/** An example as the README shows it, with the result comment after its call. */
type ReadmeEntry = ReadmeExample & { readmeComment: string | null };

// One case for each parseMeasurement call in the README's code blocks, in README order. Each
// expected result comes from the README, unless a code comment above the case names another source.
const cases: ReadmeCase[] = [
  {
    section: 'Usage',
    input: '6 ft',
    expected: {
      value: 6,
      unit: 'ft',
      type: 'height',
      matches: [{ value: 6, unit: 'ft' }],
      raw: '6 ft',
    },
  },
  {
    section: 'Usage',
    input: '5\' 11"',
    options: { type: 'height', normalizedUnit: 'cm' },
    expected: {
      value: 180.34,
      unit: 'cm',
      type: 'height',
      matches: [
        { value: 5, unit: 'ft' },
        { value: 11, unit: 'in' },
      ],
      raw: '5\' 11"',
    },
  },
  {
    section: 'Usage',
    input: '150 lbs',
    expected: {
      value: 150,
      unit: 'lb',
      type: 'weight',
      matches: [{ value: 150, unit: 'lb' }],
      raw: '150 lbs',
    },
  },
  {
    section: 'Usage',
    input: 'eighty kilograms',
    options: { type: 'weight' },
    expected: {
      value: 80,
      unit: 'kg',
      type: 'weight',
      matches: [{ value: 80, unit: 'kg' }],
      raw: 'eighty kilograms',
    },
  },
  {
    section: 'Usage',
    input: '150 lbs',
    options: { type: 'weight', normalizedUnit: 'kg' },
    expected: {
      value: 68.04,
      unit: 'kg',
      type: 'weight',
      matches: [{ value: 150, unit: 'lb' }],
      raw: '150 lbs',
    },
  },
  {
    section: 'Usage',
    input: '72',
    options: { type: 'height', allowUnqualified: true, inferUnit: 'imperial' },
    expected: { value: 72, unit: 'in', type: 'height', raw: '72' },
  },
  {
    section: 'Usage',
    input: '5 foot 10 inches',
    options: { fuzziness: 1 },
    expected: { value: 70, unit: 'in', type: 'height', raw: '5 foot 10 inches' },
  },
  { section: 'Usage', input: 'not a measurement', expected: null },
  { section: 'Weight', input: 'Height (in): 72', expected: { value: 72, unit: 'in' } },
  { section: 'Weight', input: 'm: 1.8', expected: { value: 1.8, unit: 'm' } },
  { section: 'Weight', input: 'in = 72', expected: { value: 72, unit: 'in' } },
  { section: 'Weight', input: 'in. 5', expected: { value: 5, unit: 'in' } },
  { section: 'Weight', input: 'check-in: 5', expected: null },
  { section: 'Weight', input: 'weighed 70 kg in 2020', expected: { value: 70, unit: 'kg' } },
  { section: 'Weight', input: 'M 28', expected: null },
  { section: 'Weight', input: 'Weigh in: 180 lbs', expected: { value: 180, unit: 'lb' } },
  { section: 'Weight', input: 'age=28, kg=72', expected: { value: 72, unit: 'kg' } },
  { section: 'Weight', input: 'age: 28, ft: 6', expected: { value: 6, unit: 'ft' } },
  { section: 'Weight', input: '180 lbs = 82 kg', expected: { value: 180, unit: 'lb' } },
  { section: 'Weight', input: 'age=28, kg=72 lbs', expected: { value: 72, unit: 'lb' } },
  { section: 'Weight', input: '72 (in), 180 lbs', expected: { value: 72, unit: 'in' } },
  { section: 'Weight', input: '72 in: 180 lbs', expected: { value: 180, unit: 'lb' } },
  { section: 'Weight', input: '72 in: height', expected: { value: 72, unit: 'in' } },
  // The README says only "total in inches". 5 ft 11 in is 71 in.
  {
    section: 'Handling Mixed Unit Notations',
    input: '5\'11"',
    options: { type: 'height' },
    expected: {
      value: 71,
      unit: 'in',
      type: 'height',
      matches: [
        { value: 5, unit: 'ft' },
        { value: 11, unit: 'in' },
      ],
    },
    readmeComment: 'Returns matches for both feet and inches with total in inches',
  },
  {
    section: 'Handling Mixed Unit Notations',
    input: 'five foot ten',
    options: { type: 'height' },
    expected: { value: 70, unit: 'in', type: 'height', raw: 'five foot ten' },
  },
  {
    section: 'Handling Mixed Unit Notations',
    input: '5-foot-11',
    expected: { value: 71, unit: 'in' },
  },
  {
    section: 'Handling Mixed Unit Notations',
    input: '5 ft-11',
    expected: { value: 71, unit: 'in' },
  },
  {
    section: 'Handling Mixed Unit Notations',
    input: '5\'-11"',
    expected: { value: 71, unit: 'in' },
  },
  {
    section: 'Handling Mixed Unit Notations',
    input: '0-foot-11',
    expected: { value: 11, unit: 'in' },
  },
  {
    section: 'Handling Mixed Unit Notations',
    input: '5-foot-0-inches',
    expected: { value: 60, unit: 'in' },
  },
  {
    section: 'Handling Mixed Unit Notations',
    input: '0 feet; actual 1.8 meters',
    expected: { value: 1.8, unit: 'm' },
  },
  {
    section: 'Handling Mixed Unit Notations',
    input: '180;lbs',
    expected: { value: 180, unit: 'lb' },
  },
  {
    section: 'Handling Mixed Unit Notations',
    input: 'record 0; kg 70',
    expected: { value: 70, unit: 'kg' },
  },
  {
    section: 'Handling Mixed Unit Notations',
    input: '5 ft-1 m',
    options: { normalizedUnit: 'm' },
    expected: null,
  },
  {
    section: 'Handling Mixed Unit Notations',
    input: '5-11',
    options: { type: 'height' },
    expected: { value: 71, unit: 'in' },
  },
  {
    section: 'Handling Mixed Unit Notations',
    input: '5-.5',
    options: { type: 'height' },
    expected: { value: 60.5, unit: 'in' },
  },
  {
    section: 'Handling Mixed Unit Notations',
    input: '5-11,5',
    options: { type: 'height' },
    expected: { value: 71.5, unit: 'in' },
  },
  {
    section: 'Handling Mixed Unit Notations',
    input: '5-,5',
    options: { type: 'height' },
    expected: { value: 60.5, unit: 'in' },
  },
  { section: 'Handling Mixed Unit Notations', input: '5-11', expected: null },
  {
    section: 'Handling Mixed Unit Notations',
    input: '5-12',
    options: { type: 'height' },
    expected: null,
  },
  {
    section: 'Handling Mixed Unit Notations',
    input: '5-11',
    options: { type: 'height', normalizedUnit: 'm' },
    expected: { value: 1.8034, unit: 'm' },
  },
  { section: 'Handling Mixed Unit Notations', input: '150-180 lbs', expected: null },
  { section: 'Handling Mixed Unit Notations', input: '150 – 180 lbs', expected: null },
  { section: 'Handling Mixed Unit Notations', input: 'kg 50-70', expected: null },
  { section: 'Handling Mixed Unit Notations', input: '72,5-80,5 kg', expected: null },
  { section: 'Handling Mixed Unit Notations', input: '1,250-1,500 lbs', expected: null },
  { section: 'Handling Mixed Unit Notations', input: 'kg-70.5', expected: null },
  {
    section: 'Separate Measurements',
    input: '70 kg (154 lbs)',
    expected: { value: 70, unit: 'kg' },
  },
  {
    section: 'Separate Measurements',
    input: '180 cm (5\'11")',
    expected: { value: 180, unit: 'cm' },
  },
  { section: 'Separate Measurements', input: '6 ft (72 in)', expected: { value: 6, unit: 'ft' } },
  { section: 'Separate Measurements', input: '210 lbs to 180 lbs', expected: null },
  // The README says only that it matches. 5 ft 10 in is 70 in.
  {
    section: 'Fuzzy Matching',
    input: '5 foots 10 inc',
    options: { fuzziness: 2 },
    expected: { value: 70, unit: 'in', type: 'height' },
    readmeComment: 'Successfully matches despite typos',
  },
  {
    section: 'Fuzzy Matching',
    input: '5 foots 10 inc',
    expected: null,
    readmeComment: 'Returns null due to exact matching requirement',
  },
  { section: 'Number Format Handling', input: '72.5 kg', expected: { value: 72.5, unit: 'kg' } },
  {
    section: 'Number Format Handling',
    input: 'one hundred fifty pounds',
    expected: { value: 150, unit: 'lb' },
  },
  {
    section: 'Number Format Handling',
    input: 'one hundred and 50 pounds',
    expected: { value: 150, unit: 'lb' },
  },
  // The README doesn't say which unit inferUnit defaults to, so this case doesn't check the unit.
  {
    section: 'Unit Detection Issues',
    input: '72',
    options: { type: 'height', allowUnqualified: true },
    expected: { value: 72, type: 'height' },
    readmeComment: null,
  },
  // The same call under Usage documents this result.
  {
    section: 'Unit Detection Issues',
    input: '72',
    options: { type: 'height', allowUnqualified: true, inferUnit: 'imperial' },
    expected: { value: 72, unit: 'in', type: 'height', raw: '72' },
    readmeComment: null,
  },
];

// Results that the README states in its prose, in the sections Weight, Handling Mixed Unit
// Notations, Separate Measurements, and Commas and Label Boundaries. A test can't find prose
// examples reliably, so add each new one here by hand. Each case quotes the README words that
// state its result, and a test checks that its section still contains them. Each expected
// result comes from that statement.
interface ProseCase extends ReadmeCase {
  /** The README words that state the result, with each line break written as a space. */
  statement: string;
}

const proseCases: ProseCase[] = [
  {
    section: 'Weight',
    input: '12st 4lb',
    expected: null,
    statement: '`12st 4lb` and `7 lb 8 oz` return `null`',
  },
  {
    section: 'Weight',
    input: '7 lb 8 oz',
    expected: null,
    statement: '`12st 4lb` and `7 lb 8 oz` return `null`',
  },
  {
    section: 'Weight',
    input: 'I drink 8 oz of water, weight 180 lbs',
    expected: { value: 180, unit: 'lb' },
    statement: '`I drink 8 oz of water, weight 180 lbs` returns 180 lb',
  },
  {
    section: 'Weight',
    input: '180 lbs, 8 oz of water a day',
    expected: null,
    statement: 'returns `null`, as in `180 lbs, 8 oz of water a day`',
  },
  {
    section: 'Weight',
    input: 'stone 12, 4 lb',
    expected: null,
    statement: '`stone 12, 4 lb` and `kg 3, 400 g` return `null`',
  },
  {
    section: 'Weight',
    input: 'kg 3, 400 g',
    expected: null,
    statement: '`stone 12, 4 lb` and `kg 3, 400 g` return `null`',
  },
  {
    section: 'Weight',
    input: 'Main St 12, 180 lbs',
    expected: { value: 180, unit: 'lb' },
    statement: '`Main St 12, 180 lbs` returns 180 lb',
  },
  {
    section: 'Handling Mixed Unit Notations',
    input: '150 lbs - 180 lbs',
    expected: null,
    statement: 'such as `150 lbs - 180 lbs`, return `null`',
  },
  {
    section: 'Separate Measurements',
    input: '6 ft (72 in)',
    expected: { value: 6, unit: 'ft', type: 'height' },
    statement:
      '`6 ft (72 in)` and `0.5 m (50 cm)` are a height and its conversion. When an input has more than one measurement, the first is returned',
  },
  {
    section: 'Separate Measurements',
    input: '0.5 m (50 cm)',
    expected: { value: 0.5, unit: 'm', type: 'height' },
    statement:
      '`6 ft (72 in)` and `0.5 m (50 cm)` are a height and its conversion. When an input has more than one measurement, the first is returned',
  },
  {
    section: 'Commas and Label Boundaries',
    input: '1,234,56 kg',
    expected: { value: 1234.56, unit: 'kg' },
    statement: '`1,234,56 kg` is 1234.56 kg',
  },
  {
    section: 'Commas and Label Boundaries',
    input: '12,34,567 kg',
    expected: null,
    statement: '`12,34,567 kg` and `1234,567 kg` return `null`',
  },
  {
    section: 'Commas and Label Boundaries',
    input: '1234,567 kg',
    expected: null,
    statement: '`12,34,567 kg` and `1234,567 kg` return `null`',
  },
  {
    section: 'Commas and Label Boundaries',
    input: '1,000, kg',
    expected: { value: 1000, unit: 'kg' },
    statement: '`1,000, kg` still means 1000 kg',
  },
  {
    section: 'Commas and Label Boundaries',
    input: 'weight 72,5 kg',
    expected: { value: 72.5, unit: 'kg' },
    statement: '`weight 72,5 kg` is 72.5 kg',
  },
  {
    section: 'Commas and Label Boundaries',
    input: 'height-1,800 cm',
    expected: { value: 1800, unit: 'cm' },
    statement: '`height-1,800 cm` is 1800 cm',
  },
  {
    section: 'Commas and Label Boundaries',
    input: 'phase-2, 180 cm',
    expected: { value: 180, unit: 'cm' },
    statement: '`phase-2, 180 cm` is 180 cm',
  },
];

/** Returns the README text under a heading, up to the next heading. */
function readmeSection(section: string): string {
  const [, text] = README.split(`\n### ${section}\n`);
  if (text === undefined) throw new Error(`The README has no "### ${section}" heading`);
  return text.split(/^#+ /m)[0];
}

/** The code block languages that can hold examples. */
const CODE_LANGUAGES = new Set(['typescript', 'ts', 'tsx', 'javascript', 'js', 'jsx']);

/** Evaluates a JavaScript expression from the README, which is part of this repository. */
function evaluate(source: string): unknown {
  return new Function(`return (${source});`)();
}

/** Returns the text of a comment that fills `line`, or null if there isn't one. */
function commentIn(line = ''): string | null {
  const match = /^\s*(?:\/\/\s*(.*?)|\/\*\s*(.*?)\s*\*\/)\s*$/.exec(line);
  return match ? (match[1] ?? match[2]) : null;
}

/**
 * Lists the examples in one code block. The TypeScript parser finds each parseMeasurement call, so
 * strings, comments, template literals and regular expressions are read the way JavaScript reads
 * them.
 */
function examplesIn(
  block: string,
  section: string,
  language: string,
  firstLine: number
): ReadmeEntry[] {
  const kind = language === 'tsx' || language === 'jsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile('example.ts', block, ts.ScriptTarget.Latest, true, kind);
  const examples: ReadmeEntry[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'parseMeasurement'
    ) {
      const [input, options] = node.arguments.map(argument => {
        try {
          return evaluate(argument.getText(source));
        } catch (error) {
          // An argument can't name a variable from its block, as in "parseMeasurement(input)".
          const { line } = source.getLineAndCharacterOfPosition(argument.getStart(source));
          throw new Error(
            `README line ${firstLine + line}: can't read the parseMeasurement argument ${argument.getText(source)} (${String(error)}). Write each argument as a literal.`
          );
        }
      }) as [string, ParseOptions?];
      // The result comment is on the same line as the call, or on the next line.
      const [sameLine, nextLine] = block.slice(node.getEnd()).replace(/^;/, '').split('\n');
      const readmeComment = sameLine.trim() === '' ? commentIn(nextLine) : commentIn(sameLine);
      examples.push({ section, input, ...(options && { options }), readmeComment });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return examples;
}

/** Returns the object literal at the start of `text`, using TypeScript's scanner to skip strings. */
function leadingObject(text: string): string {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, text);
  let depth = 0;
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token === ts.SyntaxKind.OpenBraceToken) depth++;
    else if (token === ts.SyntaxKind.CloseBraceToken && --depth === 0) {
      return text.slice(0, scanner.getTextPos());
    }
  }
  throw new Error(`No } closes the { at the start of ${JSON.stringify(text)}`);
}

/**
 * Lists each parseMeasurement call in the README's code blocks, in order. Fences follow
 * CommonMark: up to 3 spaces of indent, backticks or tildes, and a closing fence of the same
 * character that is at least as long. The language is the first word of the info string.
 */
function readmeExamples(readme = README): ReadmeEntry[] {
  const examples = [];
  let section = '';
  let fence: string | null = null;
  let language = '';
  let block = '';
  let firstLine = 0;
  for (const [index, line] of readme.split('\n').entries()) {
    if (fence === null) {
      const open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (open && !(open[1][0] === '`' && open[2].includes('`'))) {
        fence = open[1];
        language = open[2].trim().split(/\s+/)[0].toLowerCase();
        block = '';
        // README line numbers start at 1, and the block starts on the line after the fence.
        firstLine = index + 2;
      } else if (/^#+ /.test(line)) {
        section = line.replace(/^#+ /, '');
      }
    } else {
      const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) {
        if (CODE_LANGUAGES.has(language)) {
          examples.push(...examplesIn(block, section, language, firstLine));
        }
        fence = null;
      } else {
        block += `${line}\n`;
      }
    }
  }
  // CommonMark ends a fence that is still open at the end of the document.
  if (fence !== null && CODE_LANGUAGES.has(language)) {
    examples.push(...examplesIn(block, section, language, firstLine));
  }
  return examples;
}

/** Reads the result in a README comment: null, an object, or undefined for prose or no comment. */
function documentedResult(readmeComment: string | null): Expected | undefined {
  if (readmeComment?.startsWith('null')) return null;
  if (!readmeComment?.startsWith('{')) return undefined;
  const object = leadingObject(readmeComment).replace(/,\s*\.\.\.\s*\}$/, ' }');
  return evaluate(object) as Expected;
}

/** Keeps only the parts of `result` that `expected` names. */
function documentedParts(result: ParsedValue | null, expected: Expected): unknown {
  if (result === null || expected === null) return result;
  return Object.fromEntries(
    Object.keys(expected).map(key => [key, result[key as keyof ParsedValue]])
  );
}

/** Each unit's names, as in "kg", "kilo" and "kilograms". */
const UNIT_NAMES = new Map(
  Object.values(UNIT_ALIASES).flatMap(groups => groups.map(names => [names[0], names]))
);

/**
 * Returns the value that a result must have. Only a conversion to `normalizedUnit` can give a
 * value that the README rounds, so a converted value must match to the decimal places that the
 * README shows, and at least 2. Every other value must match exactly. That includes an input that
 * is only a number and a name of `normalizedUnit`, as in "70 kg", "kg 70" or "1,000 kg" with
 * { normalizedUnit: 'kg' }.
 */
function expectedValue(value: number, input: string, options?: ParseOptions): unknown {
  const unit = options?.normalizedUnit;
  // The input without its number, as in "kg" for "1,000 kg", "72½ kg", "kg 70" and "eighty
  // kilograms". Number words are dropped as the parser reads them.
  const inputUnit = input
    .toLowerCase()
    .split(/[\s-]+/)
    .filter(word => word !== 'and' && wordsToNumber(word) === null)
    .join('')
    .replace(/[\d.,/\u2044\u00bc-\u00be\u2150-\u215e\u2189]/g, '');
  if (unit === undefined || UNIT_NAMES.get(unit)?.includes(inputUnit)) return value;
  return expect.closeTo(value, Math.max(2, (String(value).split('.')[1] ?? '').length));
}

function nameOf({ section, input, options }: ReadmeExample): string {
  const args = [input, options].filter(arg => arg !== undefined).map(arg => JSON.stringify(arg));
  return `${section}: parseMeasurement(${args.join(', ')})`;
}

const examples = readmeExamples();

// Pairs the n-th example of a name with the n-th case of that name, so that an example that the
// README repeats keeps its own case.
const casesByName = new Map<string, ReadmeCase[]>();
for (const testCase of cases) {
  casesByName.set(nameOf(testCase), [...(casesByName.get(nameOf(testCase)) ?? []), testCase]);
}
const seenNames = new Map<string, number>();
const pairs = examples.map(example => {
  const name = nameOf(example);
  const occurrence = seenNames.get(name) ?? 0;
  seenNames.set(name, occurrence + 1);
  return [name, example.readmeComment, casesByName.get(name)?.[occurrence]] as const;
});

describe('README examples', () => {
  it('has one case for each example, in README order', () => {
    expect(cases.map(nameOf)).toEqual(examples.map(nameOf));
  });

  it.each(pairs)(
    "%s: the case's expected result matches the README comment",
    (_name, readmeComment, testCase) => {
      const documented = documentedResult(readmeComment);
      // A prose or missing comment can't give a result, so the case must quote it instead.
      const [actual, wanted] =
        documented === undefined
          ? [testCase?.readmeComment, readmeComment]
          : [testCase?.expected, documented];
      expect(actual).toEqual(wanted);
    }
  );

  it.each(cases.map(testCase => [nameOf(testCase), testCase] as const))(
    '%s returns the documented result',
    (_name, { input, options, expected }) => {
      expect(documentedParts(parseMeasurement(input, options), expected)).toEqual(
        expected && { ...expected, value: expectedValue(expected.value, input, options) }
      );
    }
  );

  it.each(proseCases.map(testCase => [nameOf(testCase), testCase] as const))(
    '%s returns the result that the README prose states',
    (_name, { input, options, expected }) => {
      expect(documentedParts(parseMeasurement(input, options), expected)).toEqual(expected);
    }
  );

  it.each(proseCases.map(testCase => [nameOf(testCase), testCase] as const))(
    '%s: the README prose still states this result',
    (_name, { section, input, statement }) => {
      expect(statement).toContain(`\`${input}\``);
      expect(readmeSection(section).replace(/\s+/g, ' ')).toContain(statement);
    }
  );
});

// The README has no same-unit example today, so these check the exact branch directly. Each wrong
// value is within the 2-decimal tolerance, so only an exact comparison rejects it.
describe('expectedValue', () => {
  it.each([
    ['70 kg', 70, 70.004],
    ['kg 70', 70, 70.004],
    ['70 kilograms', 70, 70.004],
    ['1,000 kg', 1000, 1000.004],
    ['72½ kg', 72.5, 72.504],
    ['eighty kilograms', 80, 80.004],
    ['seventy-two kg', 72, 72.004],
  ])('matches %s with { normalizedUnit: "kg" } exactly', (input, documented, wrong) => {
    expect(wrong).not.toEqual(expectedValue(documented, input, { normalizedUnit: 'kg' }));
    expect(documented).toEqual(expectedValue(documented, input, { normalizedUnit: 'kg' }));
  });

  it('allows the README rounding for a converted value', () => {
    expect(68.0388555).toEqual(expectedValue(68.04, '150 lbs', { normalizedUnit: 'kg' }));
    expect(68.0388555).toEqual(
      expectedValue(68.04, 'one hundred fifty pounds', { normalizedUnit: 'kg' })
    );
  });
});

// The README has neither form below today, so these read small documents instead.
describe('readmeExamples', () => {
  it('reads an example in a fence that is still open at the end', () => {
    const readme = "## Usage\n```ts\nparseMeasurement('6 ft'); // { value: 6, unit: 'ft', ... }\n";
    expect(readmeExamples(readme)).toEqual([
      { section: 'Usage', input: '6 ft', readmeComment: "{ value: 6, unit: 'ft', ... }" },
    ]);
  });

  it('names the README line of an argument that is a variable', () => {
    const readme = "## Usage\n```ts\nconst input = '9 ft';\nparseMeasurement(input);\n```\n";
    expect(() => readmeExamples(readme)).toThrow(
      "README line 4: can't read the parseMeasurement argument input (ReferenceError: input is not defined). Write each argument as a literal."
    );
  });
});
