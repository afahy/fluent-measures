import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseMeasurement, type ParseOptions } from '../src';

const page = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');

/**
 * Each parseMeasurement call in the page's example code, with the result that the "✓ Returns"
 * comment after it shows. The page is part of this repository, so the test evaluates its code.
 */
function examples(html: string): { input: string; options?: ParseOptions; shown: unknown }[] {
  const pattern =
    /parseMeasurement\(([^)]*)\);\s*(?:\/\/ ✓ Returns:(.*)|\/\* ✓ Returns:([\s\S]*?)\*\/)/g;
  return [...html.matchAll(pattern)].map(([, args, line, block]) => {
    const [input, options] = new Function(`return [${args}];`)() as [string, ParseOptions?];
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
