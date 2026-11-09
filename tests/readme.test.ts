import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { parseMeasurement } from '../src';
import type { ParseOptions, ParsedValue } from '../src/types';
import { UNIT_ALIASES } from '../src/units';

const README = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const PARSING = readFileSync(new URL('../PARSING.md', import.meta.url), 'utf8');

/** The documents whose examples are the public specification, in the order of `cases`. */
const DOCUMENTS = [
  ['README.md', README],
  ['PARSING.md', PARSING],
] as const;

/** The parts of a result that an example documents. `null` means the example returns null. */
type Expected = ({ value: number } & Partial<Omit<ParsedValue, 'value'>>) | null;

interface ReadmeExample {
  /** The heading in the README or PARSING.md that the example is under. */
  section: string;
  input: string;
  options?: ParseOptions;
}

interface ReadmeCase extends ReadmeExample {
  expected: Expected;
  /**
   * The example's result comment, only for an example whose result comment is prose or missing.
   * A code comment above the case then names the source of `expected`.
   */
  readmeComment?: string | null;
}

/** An example as the README or PARSING.md shows it, with the result comment after its call. */
type ReadmeEntry = ReadmeExample & { readmeComment: string | null };

// One case for each parseMeasurement call in the code blocks of the README and then PARSING.md,
// in the order of each document. Each expected result comes from the example, unless a code
// comment above the case names another source.
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
    input: 'five foot ten',
    options: { type: 'height' },
    expected: {
      value: 70,
      unit: 'in',
      type: 'height',
      matches: [
        { value: 5, unit: 'ft' },
        { value: 10, unit: 'in' },
      ],
      raw: 'five foot ten',
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
    options: { type: 'weight', normalizedUnit: 'kg' },
    expected: {
      value: 68.0388555,
      unit: 'kg',
      type: 'weight',
      matches: [{ value: 150, unit: 'lb' }],
      raw: '150 lbs',
    },
  },
  {
    section: 'Usage',
    input: '72',
    options: { defaultUnit: 'in' },
    expected: {
      value: 72,
      unit: 'in',
      type: 'height',
      matches: [{ value: 72, unit: 'in' }],
      raw: '72',
    },
  },
  {
    section: 'Usage',
    input: '5 foots 10 inc',
    options: { fuzzy: true },
    expected: {
      value: 70,
      unit: 'in',
      type: 'height',
      matches: [
        { value: 5, unit: 'ft' },
        { value: 10, unit: 'in' },
      ],
      raw: '5 foots 10 inc',
    },
  },
  { section: 'Usage', input: 'not a measurement', expected: null },
  { section: 'Limits', input: '12st 4lb', expected: null },
  { section: 'Limits', input: '150-180 lbs', expected: null },
  { section: 'Limits', input: '70 kg (154 lbs)', expected: null },
  { section: 'Limits', input: '210 lbs to 180 lbs', expected: null },
  {
    section: 'Surrounding Words',
    input: "I'm five foot eleven tall",
    expected: { value: 71, unit: 'in' },
  },
  { section: 'Surrounding Words', input: 'about 180 cm', expected: { value: 180, unit: 'cm' } },
  {
    section: 'Surrounding Words',
    input: 'I weigh one hundred fifty pounds',
    expected: { value: 150, unit: 'lb' },
  },
  { section: 'Surrounding Words', input: 'weighed 70 kg in 2020', expected: null },
  { section: 'Surrounding Words', input: 'I was 210 lbs, now 180 lbs', expected: null },
  { section: 'Surrounding Words', input: 'Top 10 in the class', expected: null },
  { section: 'Surrounding Words', input: '5’11”', expected: { value: 71, unit: 'in' } },
  { section: 'Surrounding Words', input: '(180 cm)', expected: null },
  { section: 'Surrounding Words', input: '"180 lbs"', expected: null },
  { section: 'Surrounding Words', input: '“5’11””', expected: null },
  { section: 'Surrounding Words', input: '(180) lbs', expected: null },
  {
    section: 'Units Before a Number',
    input: 'Height (in): 72',
    expected: { value: 72, unit: 'in' },
  },
  { section: 'Units Before a Number', input: 'm: 1.8', expected: { value: 1.8, unit: 'm' } },
  { section: 'Units Before a Number', input: 'in = 72', expected: { value: 72, unit: 'in' } },
  { section: 'Units Before a Number', input: 'in. 5', expected: { value: 5, unit: 'in' } },
  { section: 'Units Before a Number', input: 'check-in: 5', expected: null },
  {
    section: 'Units Before a Number',
    input: 'weighed 70 kg in 2020',
    expected: null,
  },
  { section: 'Units Before a Number', input: 'M 28', expected: null },
  {
    section: 'Units Before a Number',
    input: 'Weigh in: 180 lbs',
    expected: { value: 180, unit: 'lb' },
  },
  { section: 'Labels', input: 'age=28, kg=72', expected: null },
  { section: 'Labels', input: 'age: 28, ft: 6', expected: null },
  { section: 'Labels', input: '180 lbs = 82 kg', expected: null },
  { section: 'Labels', input: 'age=28, kg=72 lbs', expected: null },
  { section: 'Labels', input: '72 (in), 180 lbs', expected: null },
  { section: 'Labels', input: '72 in: 180 lbs', expected: null },
  { section: 'Labels', input: '72 in: height', expected: null },
  { section: 'Labels', input: 'kg=72', expected: { value: 72, unit: 'kg' } },
  { section: 'Labels', input: 'm: 1 cm: 80', expected: { value: 180, unit: 'cm' } },
  {
    section: 'Feet and Inches',
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
  },
  { section: 'Hyphens', input: '5-foot-11', expected: { value: 71, unit: 'in' } },
  { section: 'Hyphens', input: '5 ft-11', expected: { value: 71, unit: 'in' } },
  { section: 'Hyphens', input: '5\'-11"', expected: { value: 71, unit: 'in' } },
  { section: 'Hyphens', input: '0-foot-11', expected: { value: 11, unit: 'in' } },
  { section: 'Hyphens', input: '5-foot-0-inches', expected: { value: 60, unit: 'in' } },
  { section: 'Hyphens', input: '5 ft-1 m', options: { normalizedUnit: 'm' }, expected: null },
  {
    section: 'Shorthand',
    input: '5-11',
    options: { type: 'height' },
    expected: { value: 71, unit: 'in' },
  },
  {
    section: 'Shorthand',
    input: '5-.5',
    options: { type: 'height' },
    expected: { value: 60.5, unit: 'in' },
  },
  {
    section: 'Shorthand',
    input: '5-11,5',
    options: { type: 'height' },
    expected: { value: 71.5, unit: 'in' },
  },
  {
    section: 'Shorthand',
    input: '5-,5',
    options: { type: 'height' },
    expected: { value: 60.5, unit: 'in' },
  },
  { section: 'Shorthand', input: '5-11', expected: null },
  { section: 'Shorthand', input: '5-12', options: { type: 'height' }, expected: null },
  {
    section: 'Shorthand',
    input: '5-11',
    options: { type: 'height', normalizedUnit: 'm' },
    expected: { value: 1.8034, unit: 'm' },
  },
  {
    section: 'Semicolons',
    input: '0 feet; actual 1.8 meters',
    expected: null,
  },
  { section: 'Semicolons', input: '180;lbs', expected: null },
  { section: 'Semicolons', input: 'record 0; kg 70', expected: null },
  { section: 'Ranges', input: '150-180 lbs', expected: null },
  { section: 'Ranges', input: '150 – 180 lbs', expected: null },
  { section: 'Ranges', input: 'kg 50-70', expected: null },
  { section: 'Ranges', input: '72,5-80,5 kg', expected: null },
  { section: 'Ranges', input: '1,250-1,500 lbs', expected: null },
  { section: 'Ranges', input: 'kg-70.5', expected: null },
  { section: 'Ranges', input: '150 to 180 lbs', expected: null },
  { section: 'Ranges', input: 'between 70 and 80 kg', expected: null },
  { section: 'Ranges', input: '6 1-2 ft', expected: null },
  { section: 'Ranges', input: 'ft 1-2 6', expected: null },
  { section: 'Ranges', input: '6ft1-2in', expected: null },
  {
    section: 'More Than One Measurement',
    input: '70 kg (154 lbs)',
    expected: null,
  },
  {
    section: 'More Than One Measurement',
    input: '180 cm (5\'11")',
    expected: null,
  },
  {
    section: 'More Than One Measurement',
    input: '6 ft (72 in)',
    expected: null,
  },
  { section: 'More Than One Measurement', input: '210 lbs to 180 lbs', expected: null },
  {
    section: 'More Than One Measurement',
    input: '5\'11", 180 lbs',
    options: { type: 'height' },
    expected: { value: 71, unit: 'in' },
  },
  {
    section: 'More Than One Measurement',
    input: '5\'11", 180 lbs',
    options: { type: 'weight' },
    expected: { value: 180, unit: 'lb' },
  },
  { section: 'Numbers', input: '72.5 kg', expected: { value: 72.5, unit: 'kg' } },
  {
    section: 'Numbers',
    input: 'one hundred fifty pounds',
    expected: { value: 150, unit: 'lb' },
  },
  {
    section: 'Numbers',
    input: 'one hundred and 50 pounds',
    expected: { value: 150, unit: 'lb' },
  },
  {
    section: 'Numbers With No Unit',
    input: '72',
    options: { defaultUnit: 'in' },
    expected: { value: 72, unit: 'in' },
  },
  {
    section: 'Numbers With No Unit',
    input: '150',
    options: { defaultUnit: 'lb' },
    expected: { value: 150, unit: 'lb' },
  },
  {
    section: 'Numbers With No Unit',
    input: '1.8',
    options: { defaultUnit: 'm' },
    expected: { value: 1.8, unit: 'm' },
  },
  {
    section: 'Numbers With No Unit',
    input: '180',
    options: { defaultUnit: 'cm' },
    expected: { value: 180, unit: 'cm' },
  },
  {
    section: 'Numbers With No Unit',
    input: '70',
    options: { defaultUnit: 'kg' },
    expected: { value: 70, unit: 'kg' },
  },
  {
    section: 'Numbers With No Unit',
    input: '72',
    options: {
      defaultUnit: 'in',
      normalizedUnit: 'cm',
    },
    expected: {
      value: 182.88,
      unit: 'cm',
      type: 'height',
      matches: [{ value: 72, unit: 'in' }],
      raw: '72',
    },
  },
  {
    section: 'Fuzzy Matching',
    input: '5 foots 10 inc',
    options: { fuzzy: true },
    expected: { value: 70, unit: 'in' },
  },
  { section: 'Fuzzy Matching', input: '5 foots 10 inc', expected: null },
  {
    section: 'Fuzzy Matching',
    input: '5 foot 10 inches',
    options: { fuzzy: true },
    expected: { value: 70, unit: 'in' },
  },
];

// Results that the README and PARSING.md state in their prose. A test can't find prose examples
// reliably, so add each new one here by hand. Each case quotes the words that state its result,
// and a test checks that its section still contains them. Each expected result comes from that
// statement.
interface ProseCase extends ReadmeCase {
  /** The words that state the result, with each line break written as a space. */
  statement: string;
}

const proseCases: ProseCase[] = [
  {
    section: 'Ranges',
    input: '50-70 kg, 180 lbs',
    expected: null,
    statement:
      '`50-70 kg, 180 lbs`, `1-2 ft 6`, `6 1-2 ft 3 in` and `6 ft 1-2 11 in` all return `null`',
  },
  {
    section: 'Ranges',
    input: '1-2 ft 6',
    expected: null,
    statement: '`1-2 ft 6`, `6 1-2 ft 3 in`',
  },
  {
    section: 'Ranges',
    input: '6 1-2 ft 3 in',
    expected: null,
    statement: '`1-2 ft 6`, `6 1-2 ft 3 in`',
  },

  {
    section: 'Limits',
    input: 'Top 10 in the class',
    expected: null,
    statement: '`Top 10 in the class`',
  },
  {
    section: 'Unsupported Units',
    input: '12st 4lb',
    expected: null,
    statement:
      '`12st 4lb`, `7 lb 8 oz`, `7 lb, 8 oz`, `stone 12, 4 lb` and `kg 3, 400 g` return `null`',
  },
  {
    section: 'Unsupported Units',
    input: '7 lb 8 oz',
    expected: null,
    statement:
      '`12st 4lb`, `7 lb 8 oz`, `7 lb, 8 oz`, `stone 12, 4 lb` and `kg 3, 400 g` return `null`',
  },
  {
    section: 'Unsupported Units',
    input: 'I drink 8 oz of water, weight 180 lbs',
    expected: null,
    statement:
      '`I drink 8 oz of water, weight 180 lbs` and `180 lbs, 8 oz of water a day` return `null`',
  },
  {
    section: 'Unsupported Units',
    input: '180 lbs, 8 oz of water a day',
    expected: null,
    statement:
      '`I drink 8 oz of water, weight 180 lbs` and `180 lbs, 8 oz of water a day` return `null`',
  },
  {
    section: 'Unsupported Units',
    input: 'stone 12, 4 lb',
    expected: null,
    statement:
      '`12st 4lb`, `7 lb 8 oz`, `7 lb, 8 oz`, `stone 12, 4 lb` and `kg 3, 400 g` return `null`',
  },
  {
    section: 'Unsupported Units',
    input: 'kg 3, 400 g',
    expected: null,
    statement:
      '`12st 4lb`, `7 lb 8 oz`, `7 lb, 8 oz`, `stone 12, 4 lb` and `kg 3, 400 g` return `null`',
  },
  {
    section: 'Unsupported Units',
    input: 'Main St 12, 180 lbs',
    expected: null,
    statement: '`Main St 12, 180 lbs` also returns `null`',
  },
  {
    section: 'Limits',
    input: 'Top 10 in the class',
    expected: null,
    statement: '`Top 10 in the class`',
  },
  {
    section: 'Ranges',
    input: '150 lbs - 180 lbs',
    expected: null,
    statement: '`150 lbs - 180 lbs` is also `null`',
  },
  {
    section: 'More Than One Measurement',
    input: '6 ft (72 in)',
    expected: null,
    statement: '`6 ft (72 in)` and `0.5 m (50 cm)` are duplicate representations, not compounds',
  },
  {
    section: 'More Than One Measurement',
    input: '0.5 m (50 cm)',
    expected: null,
    statement: '`6 ft (72 in)` and `0.5 m (50 cm)` are duplicate representations, not compounds',
  },
  {
    section: 'Commas',
    input: '1,234,56 kg',
    expected: { value: 1234.56, unit: 'kg' },
    statement: '`1,234,56 kg` is 1234.56 kg',
  },
  {
    section: 'Commas',
    input: '12,34,567 kg',
    expected: null,
    statement: '`12,34,567 kg` and `1234,567 kg` return `null`',
  },
  {
    section: 'Commas',
    input: '1234,567 kg',
    expected: null,
    statement: '`12,34,567 kg` and `1234,567 kg` return `null`',
  },
  {
    section: 'Commas',
    input: '1,000, kg',
    expected: null,
    statement: '`1,000, kg` returns `null`',
  },
  {
    section: 'Commas',
    input: 'weight 72,5 kg',
    expected: { value: 72.5, unit: 'kg' },
    statement: '`weight 72,5 kg` is 72.5 kg',
  },
  {
    section: 'Commas',
    input: 'height-1,800 cm',
    expected: null,
    statement: '`height-1,800 cm` returns `null`',
  },
  {
    section: 'Commas',
    input: 'phase-2, 180 cm',
    expected: null,
    statement:
      '`phase 2,180 cm`, `phase-2,180 cm`, `phase-2, 180 cm` and `phase2,180 cm` all return `null`',
  },
  {
    section: 'Commas',
    input: 'phase2,180 cm',
    expected: null,
    statement:
      '`phase 2,180 cm`, `phase-2,180 cm`, `phase-2, 180 cm` and `phase2,180 cm` all return `null`',
  },
];

/** Returns the text under a heading in the README or PARSING.md, up to the next heading. */
function documentSection(section: string): string {
  const isHeading = (line: string): boolean => /^#+ /.test(line);
  for (const [, text] of DOCUMENTS) {
    const lines = text.split('\n');
    const start = lines.findIndex(line => isHeading(line) && line.replace(/^#+ /, '') === section);
    if (start === -1) continue;
    const end = lines.findIndex((line, index) => index > start && isHeading(line));
    return lines.slice(start + 1, end === -1 ? undefined : end).join('\n');
  }
  throw new Error(`Neither README.md nor PARSING.md has a "${section}" heading`);
}

const CODE_LANGUAGES = new Set(['typescript', 'ts', 'tsx', 'javascript', 'js', 'jsx']);

/** Evaluates a JavaScript expression from a document in this repository. */
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
  document: string,
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
            `${document} line ${firstLine + line}: can't read the parseMeasurement argument ${argument.getText(source)} (${String(error)}). Write each argument as a literal.`,
            { cause: error }
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
 * Lists each parseMeasurement call in the code blocks of `text`, in order. `document` names the
 * file in error messages. Fences follow CommonMark: up to 3 spaces of indent, backticks or tildes,
 * and a closing fence of the same character that is at least as long. The language is the first
 * word of the info string.
 */
function documentExamples(text: string, document: string): ReadmeEntry[] {
  const examples = [];
  let section = '';
  let fence: string | null = null;
  let language = '';
  let block = '';
  let firstLine = 0;
  for (const [index, line] of text.split('\n').entries()) {
    if (fence === null) {
      const open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (open && !(open[1][0] === '`' && open[2].includes('`'))) {
        fence = open[1];
        language = open[2].trim().split(/\s+/)[0].toLowerCase();
        block = '';
        // Line numbers start at 1, and the block starts on the line after the fence.
        firstLine = index + 2;
      } else if (/^#+ /.test(line)) {
        section = line.replace(/^#+ /, '');
      }
    } else {
      const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) {
        if (CODE_LANGUAGES.has(language)) {
          examples.push(...examplesIn(block, section, language, document, firstLine));
        }
        fence = null;
      } else {
        block += `${line}\n`;
      }
    }
  }
  // CommonMark ends a fence that is still open at the end of the document.
  if (fence !== null && CODE_LANGUAGES.has(language)) {
    examples.push(...examplesIn(block, section, language, document, firstLine));
  }
  return examples;
}

/** Reads the result in a result comment: null, an object, or undefined for prose or no comment. */
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

const ALL_UNIT_NAMES = new Set([...UNIT_NAMES.values()].flat());

/**
 * Returns the value that a result must have. Only a conversion to `normalizedUnit` can give a
 * value that an example rounds, so a converted value must match to the decimal places that the
 * example shows, and at least 2. Every other value must match exactly. That includes an input whose
 * unit names all name `normalizedUnit`, as in "70 kg", "1,000 kg", "eighty kilograms", "kg=72"
 * or "age=28, kg=72" with { normalizedUnit: 'kg' }.
 */
function expectedValue(value: number, input: string, options?: ParseOptions): unknown {
  const unit = options?.normalizedUnit;
  if (unit === undefined) return value;
  // The words in the input that are unit names. Numbers, number words, labels such as "age"
  // and separators such as "=" aren't unit names, so they drop out.
  const inputUnits = input
    .toLowerCase()
    .split(/[^\p{L}'"]+/u)
    .filter(word => ALL_UNIT_NAMES.has(word));
  const names: readonly string[] = UNIT_NAMES.get(unit) ?? [];
  if (inputUnits.length > 0 && inputUnits.every(word => names.includes(word))) return value;
  return expect.closeTo(value, Math.max(2, (String(value).split('.')[1] ?? '').length));
}

function nameOf({ section, input, options }: ReadmeExample): string {
  const args = [input, options].filter(arg => arg !== undefined).map(arg => JSON.stringify(arg));
  return `${section}: parseMeasurement(${args.join(', ')})`;
}

const examples = DOCUMENTS.flatMap(([document, text]) => documentExamples(text, document));

// Pairs the n-th example of a name with the n-th case of that name, so that an example that the
// documents repeat keeps its own case.
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

describe('README and PARSING.md examples', () => {
  it('has one case for each example, in document order', () => {
    expect(cases.map(nameOf)).toEqual(examples.map(nameOf));
  });

  it.each(pairs)(
    "%s: the case's expected result matches the result comment",
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
    '%s returns the result that the prose states',
    (_name, { input, options, expected }) => {
      expect(documentedParts(parseMeasurement(input, options), expected)).toEqual(expected);
    }
  );

  it.each(proseCases.map(testCase => [nameOf(testCase), testCase] as const))(
    '%s: the prose still states this result',
    (_name, { section, input, statement }) => {
      expect(statement).toContain(`\`${input}\``);
      expect(documentSection(section).replace(/\s+/g, ' ')).toContain(statement);
    }
  );
});

// The documents have no same-unit example today, so these check the exact branch directly. Each wrong
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
    ['kg=72', 72, 72.004],
    ['age=28, kg=72', 72, 72.004],
    ['weight (kg): 72', 72, 72.004],
  ])('matches %s with { normalizedUnit: "kg" } exactly', (input, documented, wrong) => {
    expect(wrong).not.toEqual(expectedValue(documented, input, { normalizedUnit: 'kg' }));
    expect(documented).toEqual(expectedValue(documented, input, { normalizedUnit: 'kg' }));
  });

  it('allows the rounding of an example for a converted value', () => {
    expect(68.0388555).toEqual(expectedValue(68.04, '150 lbs', { normalizedUnit: 'kg' }));
    // A second unit means the result may come from a conversion.
    expect(70.004).toEqual(expectedValue(70, '70 kg (154 lbs)', { normalizedUnit: 'kg' }));
    expect(68.0388555).toEqual(
      expectedValue(68.04, 'one hundred fifty pounds', { normalizedUnit: 'kg' })
    );
  });
});

// The documents have neither form below today, so these read small documents instead.
describe('documentExamples', () => {
  it('reads an example in a fence that is still open at the end', () => {
    const readme = "## Usage\n```ts\nparseMeasurement('6 ft'); // { value: 6, unit: 'ft', ... }\n";
    expect(documentExamples(readme, 'README.md')).toEqual([
      { section: 'Usage', input: '6 ft', readmeComment: "{ value: 6, unit: 'ft', ... }" },
    ]);
  });

  it('names the document line of an argument that is a variable', () => {
    const readme = "## Usage\n```ts\nconst input = '9 ft';\nparseMeasurement(input);\n```\n";
    expect(() => documentExamples(readme, 'README.md')).toThrow(
      "README.md line 4: can't read the parseMeasurement argument input (ReferenceError: input is not defined). Write each argument as a literal."
    );
  });
});

// The README and the docs page state the size budget that .size-limit.cjs sets. A change to the
// budget must change them too, or they claim a size that CI no longer checks.
describe('the size budget', () => {
  const budgets = new Set(
    (createRequire(import.meta.url)('../.size-limit.cjs') as { limit: string }[]).map(
      ({ limit }) => limit
    )
  );

  it.each([
    ['README.md', README],
    ['docs/index.html', readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8')],
  ])('is the only size that %s states', (_file, text) => {
    const sizes = text.replace(/\s+/g, ' ').match(/\b\d+(?:\.\d+)? kB\b/g) ?? [];
    expect(sizes.length).toBeGreaterThan(0);
    expect(new Set(sizes)).toEqual(budgets);
  });
});
