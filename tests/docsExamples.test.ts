import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions } from '../src';

const page = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');

/** The arguments of a parseMeasurement call in the page's code. The test evaluates the code. */
function callArgs(args: string): [string, ParseOptions?] {
  return new Function(`return [${args}];`)() as [string, ParseOptions?];
}

/**
 * Each parseMeasurement call in the page's example code, with the result that the "✓ Returns"
 * comment after it shows. The page is part of this repository, so the test evaluates its code.
 */
function examples(html: string): { input: string; options?: ParseOptions; shown: unknown }[] {
  const pattern =
    /parseMeasurement\(([^)]*)\);\s*(?:\/\/ ✓ Returns:(.*)|\/\* ✓ Returns:([\s\S]*?)\*\/)/g;
  return [...html.matchAll(pattern)].map(([, args, line, block]) => {
    const [input, options] = callArgs(args);
    return { input, options, shown: new Function(`return (${line ?? block});`)() };
  });
}

// The docs page shows what each example returns, so a change to a result must change the page.
describe('the docs page examples', () => {
  it('reads a result for each "✓ Returns" comment', () => {
    expect(examples(page).length).toBeGreaterThan(0);
    expect(examples(page)).toHaveLength(page.split('✓ Returns').length - 1);
  });

  it.each(examples(page))('returns what the page shows for $input with $options', example => {
    expect(parseMeasurement(example.input, example.options)).toEqual(example.shown);
  });
});

/** A short result on the page: a value and a unit, or null. */
type Shown = { value: number; unit: string } | null;

/** A parseMeasurement call, the short result that the page shows for it and a name for the test. */
type ShownCase = { label: string; input: string; options?: ParseOptions; shown: Shown };

/**
 * The short result in an HTML fragment, such as "<b>180.34</b> cm", or "null" when the element
 * has the "is-null" class. Other text throws, so a result that the test can't read fails it.
 */
function shownResult(isNull: boolean, html: string): Shown {
  const text = html.trim();
  if (isNull) {
    if (text !== 'null') throw new Error(`An "is-null" result shows "${text}"`);
    return null;
  }
  const match = /^<b>([^<]+)<\/b>\s*([^<\s]*)$/.exec(text);
  if (!match) throw new Error(`Can't read the result "${text}"`);
  return { value: Number(match[1]), unit: match[2] };
}

/** The value and unit of a parseMeasurement result, or null, to compare with a short result. */
function short(input: string, options?: ParseOptions): Shown {
  const result = parseMeasurement(input, options);
  return result && { value: result.value, unit: result.unit ?? '' };
}

/** A case for a call and its short result, named by the result, the input and the options. */
function shownCase(input: string, options: ParseOptions | undefined, shown: Shown): ShownCase {
  const result = shown ? `${shown.value} ${shown.unit}`.trim() : 'null';
  const call = `${JSON.stringify(input)} with ${options ? JSON.stringify(options) : 'no options'}`;
  return { label: `${result} for ${call}`, input, options, shown };
}

/**
 * Each parseMeasurement call in a code example, with the name of the variable that it assigns,
 * or "" when it assigns none. The TypeScript parser finds the calls, so a ")" in a string doesn't
 * end one.
 */
function callsIn(code: string): { name: string; input: string; options?: ParseOptions }[] {
  const source = ts.createSourceFile('example.ts', code, ts.ScriptTarget.Latest, true);
  const calls: { name: string; input: string; options?: ParseOptions }[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'parseMeasurement'
    ) {
      const [input, options] = callArgs(node.arguments.map(arg => arg.getText(source)).join(', '));
      const { parent } = node;
      const assigned = ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name);
      calls.push({ name: assigned ? parent.name.text : '', input, options });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return calls;
}

/**
 * Each row of the hero demo card: the input, the options and the result that the row shows. A row
 * shows its options as an object's keys and values, or "no options" with the "is-none" class.
 */
function heroRows(html: string): ShownCase[] {
  const list = /<dl class="demo-list"[^>]*>([\s\S]*?)<\/dl>/.exec(html)?.[1] ?? '';
  const row =
    /<dt>\s*<span class="demo-input">([^<]*)<\/span>\s*<span class="demo-opts( is-none)?"\s*>([\s\S]*?)<\/span\s*>\s*<\/dt>\s*<dd( class="is-null")?>\s*<svg[\s\S]*?<\/svg>\s*<span>([\s\S]*?)<\/span>\s*<\/dd>/g;
  return [...list.matchAll(row)].map(([, input, none, optionsHtml, isNull, result]) => {
    // Keep the text between the tags. Splitting reads the text out of the markup instead of
    // sanitizing it, which CodeQL's js/incomplete-multi-character-sanitization flags.
    const keys = optionsHtml
      .split(/<[^>]*>/)
      .join('')
      .replace(/\s+/g, ' ');
    const options = none ? undefined : (new Function(`return ({${keys}});`)() as ParseOptions);
    return shownCase(input, options, shownResult(Boolean(isNull), result));
  });
}

/**
 * Each "Returns" block in Usage, with the parseMeasurement calls in the code before it and its
 * one-line summaries. A summary with a key, such as "strict", is about the call that the code
 * assigns to that name. A summary with no key is about the calls that the code doesn't assign.
 * The calls of a block are those since the previous block, in each version of the code, such as
 * the wide and the narrow one.
 */
function returnsBlocks(html: string): {
  calls: { name: string; input: string; options?: ParseOptions }[];
  summaries: { key: string; shown: Shown }[];
}[] {
  const pieces = html.split('<div class="returns">');
  return pieces.slice(1).map((block, index) => {
    const code = [...pieces[index].matchAll(/<code class="language-[\w-]+">([\s\S]*?)<\/code>/g)];
    const summary =
      /<p class="summary">\s*(?:<span class="summary-key">([^<]*)<\/span>)?<span( class="is-null")?>([\s\S]*?)<\/span\s*>/g;
    return {
      calls: code.flatMap(([, text]) => callsIn(text)),
      summaries: [...block.matchAll(summary)].map(([, key, isNull, result]) => ({
        key: key ?? '',
        shown: shownResult(Boolean(isNull), result),
      })),
    };
  });
}

const rows = heroRows(page);
const blocks = returnsBlocks(page);

/**
 * Each pair of a Returns summary and a call that it is about. The wide and the narrow code, or the
 * ESM and the CommonJS code, repeat a call, so each call and result is one case.
 */
const summaryCases = [
  ...new Map(
    blocks
      .flatMap(({ calls, summaries }) =>
        summaries.flatMap(({ key, shown }) =>
          calls
            .filter(call => call.name === key)
            .map(({ input, options }) => shownCase(input, options, shown))
        )
      )
      .map(item => [item.label, item])
  ).values(),
];

// AFA-191: the hero card and the Returns summaries show a short result, the value and the unit.
// Until AFA-18 they showed 68.04 kg for "150 lbs", while the full object showed 68.0388555.
describe('the short results on the docs page', () => {
  it('reads each row of the hero demo card', () => {
    expect(rows.length).toBeGreaterThan(0);
    expect(rows).toHaveLength(page.split('class="demo-input"').length - 1);
  });

  // The disclosure changes only visibility. The accepted design preserves these exact eight
  // triples from the settled page, including the unrounded conversion and both null cases.
  it('preserves the eight hero input/options/result triples in their curated order', () => {
    expect(rows.map(({ input, options, shown }) => ({ input, options, shown }))).toEqual([
      {
        input: '5\' 11"',
        options: { type: 'height', normalizedUnit: 'cm' },
        shown: { value: 180.34, unit: 'cm' },
      },
      { input: 'eighty kilograms', options: { type: 'weight' }, shown: { value: 80, unit: 'kg' } },
      { input: '5 foots 10 inc', options: { fuzziness: 2 }, shown: { value: 70, unit: 'in' } },
      { input: 'not a measurement', options: undefined, shown: null },
      {
        input: '150 lbs',
        options: { type: 'weight', normalizedUnit: 'kg' },
        shown: { value: 68.0388555, unit: 'kg' },
      },
      { input: 'five foot ten', options: { type: 'height' }, shown: { value: 70, unit: 'in' } },
      { input: '72,5 kg', options: undefined, shown: { value: 72.5, unit: 'kg' } },
      { input: '150-180 lbs', options: undefined, shown: null },
    ]);
  });

  it.each(rows.map(row => [row.label, row]))('the hero shows %s', (_, row) => {
    expect(short(row.input, row.options)).toEqual(row.shown);
  });

  it('reads each Returns summary and the calls that it is about', () => {
    expect.hasAssertions();
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.flatMap(block => block.summaries)).toHaveLength(
      page.split('<p class="summary">').length - 1
    );
    for (const { calls, summaries } of blocks) {
      expect(calls.length).toBeGreaterThan(0);
      const keys = summaries.map(summary => summary.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect([...new Set(calls.map(call => call.name))].sort()).toEqual([...keys].sort());
    }
  });

  it.each(summaryCases.map(item => [item.label, item]))('a summary shows %s', (_, item) => {
    expect(short(item.input, item.options)).toEqual(item.shown);
  });
});

/** Compact input/output rows show their literal input and any options beside the result. */
function compactRows(html: string): ShownCase[] {
  const lists = [...html.matchAll(/<dl class="input-results"[^>]*>([\s\S]*?)<\/dl>/g)];
  const row =
    /<dt>\s*<code class="input-text">([^<]*)<\/code\s*>\s*(?:<code class="input-options">([^<]*)<\/code>)?\s*<\/dt>\s*<dd( class="is-null")?>([\s\S]*?)<\/dd>/g;
  return lists.flatMap(([, list]) =>
    [...list.matchAll(row)].map(([, input, options, isNull, result]) =>
      shownCase(
        input,
        options ? (new Function(`return (${options});`)() as ParseOptions) : undefined,
        shownResult(Boolean(isNull), result)
      )
    )
  );
}

const compact = compactRows(page);

describe('compact docs examples', () => {
  it('checks every displayed compact result', () => {
    expect(compact.length).toBeGreaterThan(0);
    expect(compact).toHaveLength(page.split('class="input-text"').length - 1);
  });

  it.each(compact.map(row => [row.label, row]))('shows %s', (_, row) => {
    expect(short(row.input, row.options)).toEqual(row.shown);
  });

  // README Usage supplies these complete objects. Keep checking all their fields even though
  // the page now displays these format variants as compact rows instead of full code cards.
  it.each([
    {
      input: '150 lbs',
      options: undefined,
      expected: {
        value: 150,
        unit: 'lb',
        type: 'weight',
        matches: [{ value: 150, unit: 'lb' }],
        raw: '150 lbs',
      },
    },
    {
      input: 'five foot ten',
      options: { type: 'height' } as const,
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
    { input: 'not a measurement', options: undefined, expected: null },
  ])('preserves the complete documented result for $input', ({ input, options, expected }) => {
    expect(compact.some(row => row.input === input)).toBe(true);
    expect(parseMeasurement(input, options)).toEqual(expected);
  });
});
