import { readFileSync } from 'node:fs';
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
  const match = /^<b>([^<]+)<\/b>\s*([^<\s]+)$/.exec(text);
  if (!match) throw new Error(`Can't read the result "${text}"`);
  return { value: Number(match[1]), unit: match[2] };
}

/** The value and unit of a parseMeasurement result, or null, to compare with a short result. */
function short(input: string, options?: ParseOptions): Shown {
  const result = parseMeasurement(input, options);
  return result && { value: result.value, unit: result.unit ?? '' };
}

/**
 * Each row of the hero demo card: the input, the options and the result that the row shows. A row
 * shows its options as an object's keys and values, or "no options" with the "is-none" class.
 */
function heroRows(html: string): { input: string; options?: ParseOptions; shown: Shown }[] {
  const list = /<dl class="demo-list"[^>]*>([\s\S]*?)<\/dl>/.exec(html)?.[1] ?? '';
  const row =
    /<dt>\s*<span class="demo-input">([^<]*)<\/span>\s*<span class="demo-opts( is-none)?"\s*>([\s\S]*?)<\/span\s*>\s*<\/dt>\s*<dd( class="is-null")?>\s*<svg[\s\S]*?<\/svg>\s*<span>([\s\S]*?)<\/span>\s*<\/dd>/g;
  return [...list.matchAll(row)].map(([, input, none, optionsHtml, isNull, result]) => {
    const options = optionsHtml.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ');
    return {
      input,
      options: none ? undefined : (new Function(`return ({${options}});`)() as ParseOptions),
      shown: shownResult(Boolean(isNull), result),
    };
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
    const calls = code.flatMap(([, text]) =>
      [...text.matchAll(/(?:\b(?:const|let)\s+(\w+)\s*=\s*)?parseMeasurement\(([^)]*)\)/g)].map(
        ([, name, args]) => {
          const [input, options] = callArgs(args);
          return { name: name ?? '', input, options };
        }
      )
    );
    const summary =
      /<p class="summary">\s*(?:<span class="summary-key">([^<]*)<\/span>)?<span( class="is-null")?>([\s\S]*?)<\/span\s*>/g;
    const summaries = [...block.matchAll(summary)].map(([, key, isNull, result]) => ({
      key: key ?? '',
      shown: shownResult(Boolean(isNull), result),
    }));
    return { calls, summaries };
  });
}

/** Each pair of a Returns summary and a call that it is about. */
function summaryCases(html: string): { input: string; options?: ParseOptions; shown: Shown }[] {
  return returnsBlocks(html).flatMap(({ calls, summaries }) =>
    summaries.flatMap(({ key, shown }) =>
      calls
        .filter(call => call.name === key)
        .map(({ input, options }) => ({ input, options, shown }))
    )
  );
}

// AFA-191: the hero card and the Returns summaries show a short result, the value and the unit.
// Until AFA-18 they showed 68.04 kg for "150 lbs", while the full object showed 68.0388555.
describe('the short results on the docs page', () => {
  it('reads each row of the hero demo card', () => {
    expect(heroRows(page).length).toBeGreaterThan(0);
    expect(heroRows(page)).toHaveLength(page.split('class="demo-input"').length - 1);
  });

  it.each(heroRows(page))('shows in the hero what $input with $options returns', row => {
    expect(short(row.input, row.options)).toEqual(row.shown);
  });

  it('reads each Returns summary and the calls that it is about', () => {
    expect.hasAssertions();
    const blocks = returnsBlocks(page);
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

  it.each(summaryCases(page))('shows in a summary what $input with $options returns', item => {
    expect(short(item.input, item.options)).toEqual(item.shown);
  });
});
