import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';
import type { ParseOptions, ParsedValue } from '../src/types';

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

/** A parseMeasurement call: the name, any whitespace, then an opening parenthesis. */
const CALL = /parseMeasurement\s*\(/y;

/** The code block languages that can hold examples. */
const CODE_LANGUAGES = new Set(['typescript', 'ts', 'tsx', 'javascript', 'js', 'jsx']);

/**
 * Yields the index of each character of `text` that is code, from `start` on. Strings, comments
 * and the text of template literals aren't code, but a template literal's `${...}` parts are.
 */
function* codeIndexes(text: string, start = 0): Generator<number> {
  // For each open `${`, the brace depth at which its closing `}` comes.
  const templates: number[] = [];
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (char === "'" || char === '"') {
      i++;
      while (i < text.length && text[i] !== char) i += text[i] === '\\' ? 2 : 1;
    } else if (text.startsWith('//', i)) {
      const newline = text.indexOf('\n', i);
      i = newline < 0 ? text.length : newline;
    } else if (text.startsWith('/*', i)) {
      const close = text.indexOf('*/', i + 2);
      i = close < 0 ? text.length : close + 1;
    } else if (char === '`' || (char === '}' && templates[templates.length - 1] === depth)) {
      // Skip template text up to the closing backtick or the next `${`.
      if (char === '}') templates.pop();
      i++;
      while (i < text.length && text[i] !== '`' && !text.startsWith('${', i)) {
        i += text[i] === '\\' ? 2 : 1;
      }
      if (text.startsWith('${', i)) {
        templates.push(depth);
        i++;
      }
    } else {
      if (char === '{') depth++;
      if (char === '}') depth--;
      yield i;
    }
  }
}

/** Returns the index just after the bracket that closes the one at `start`. */
function indexAfterClose(text: string, start: number): number {
  const open = text[start];
  const close = open === '(' ? ')' : '}';
  let depth = 0;
  for (const i of codeIndexes(text, start)) {
    if (text[i] === open) depth++;
    else if (text[i] === close && --depth === 0) return i + 1;
  }
  throw new Error(`No ${close} closes the ${open} at index ${start}`);
}

/**
 * Returns the index of the opening parenthesis of each parseMeasurement call in `code`, outside
 * strings and comments.
 */
function callOpenings(code: string): number[] {
  const openings = [];
  for (const i of codeIndexes(code)) {
    CALL.lastIndex = i;
    const match = CALL.exec(code);
    if (match && !/[\w$]/.test(code[i - 1] ?? '')) openings.push(i + match[0].length - 1);
  }
  return openings;
}

/** Evaluates a JavaScript expression from the README, which is part of this repository. */
function evaluate(source: string): unknown {
  return new Function(`return (${source});`)();
}

/** Returns the text of a comment that fills `line`, or null if there isn't one. */
function commentIn(line = ''): string | null {
  const match = /^\s*(?:\/\/\s*(.*?)|\/\*\s*(.*?)\s*\*\/)\s*$/.exec(line);
  return match ? (match[1] ?? match[2]) : null;
}

/** Lists the examples in one code block. */
function examplesIn(block: string, section: string): ReadmeEntry[] {
  return callOpenings(block).map(open => {
    const end = indexAfterClose(block, open);
    const args = block.slice(open + 1, end - 1);
    const [input, options] = evaluate(`[${args}\n]`) as [string, ParseOptions?];
    // The result comment is on the same line as the call, or on the next line.
    const [sameLine, nextLine] = block.slice(end).replace(/^;/, '').split('\n');
    const readmeComment = sameLine.trim() === '' ? commentIn(nextLine) : commentIn(sameLine);
    return { section, input, ...(options && { options }), readmeComment };
  });
}

/**
 * Lists each parseMeasurement call in the README's code blocks, in order. Fences follow
 * CommonMark: up to 3 spaces of indent, backticks or tildes, and a closing fence of the same
 * character that is at least as long. The language is the first word of the info string.
 */
function readmeExamples(): ReadmeEntry[] {
  const examples = [];
  let section = '';
  let fence: string | null = null;
  let language = '';
  let block = '';
  for (const line of readFileSync(new URL('../README.md', import.meta.url), 'utf8').split('\n')) {
    if (fence === null) {
      const open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (open && !(open[1][0] === '`' && open[2].includes('`'))) {
        fence = open[1];
        language = open[2].trim().split(/\s+/)[0].toLowerCase();
        block = '';
      } else if (/^#+ /.test(line)) {
        section = line.replace(/^#+ /, '');
      }
    } else {
      const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) {
        if (CODE_LANGUAGES.has(language)) examples.push(...examplesIn(block, section));
        fence = null;
      } else {
        block += `${line}\n`;
      }
    }
  }
  return examples;
}

/** Reads the result in a README comment: null, an object, or undefined for prose or no comment. */
function documentedResult(readmeComment: string | null): Expected | undefined {
  if (readmeComment?.startsWith('null')) return null;
  if (!readmeComment?.startsWith('{')) return undefined;
  const object = readmeComment
    .slice(0, indexAfterClose(readmeComment, 0))
    .replace(/,\s*\.\.\.\s*\}$/, ' }');
  return evaluate(object) as Expected;
}

/** Keeps only the parts of `result` that `expected` names. */
function documentedParts(result: ParsedValue | null, expected: Expected): unknown {
  if (result === null || expected === null) return result;
  return Object.fromEntries(
    Object.keys(expected).map(key => [key, result[key as keyof ParsedValue]])
  );
}

/**
 * Returns the value that a result must have. Only a conversion to `normalizedUnit` can give a
 * value that the README rounds, so a converted value must match to the decimal places that the
 * README shows, and at least 2. Every other value must match exactly.
 */
function expectedValue(value: number, options?: ParseOptions): unknown {
  if (options?.normalizedUnit === undefined) return value;
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
        expected && { ...expected, value: expectedValue(expected.value, options) }
      );
    }
  );
});
