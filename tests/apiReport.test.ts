import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { apiReport, REPORT } from '../.github/scripts/api-report.mjs';

describe('apiReport', () => {
  it('removes comments and formats the declarations as Prettier does', async () => {
    const built = [
      'interface Options {',
      '    /** The unit. */',
      '    unit?: "ft" | "in";',
      '}',
      '// A line comment.',
      'declare function parse(input: string, options?: Options): number | null;',
      '',
      'export { type Options, parse };',
      '',
    ].join('\n');
    await expect(apiReport(built)).resolves.toBe(
      [
        'interface Options {',
        "  unit?: 'ft' | 'in';",
        '}',
        'declare function parse(input: string, options?: Options): number | null;',
        'export { type Options, parse };',
        '',
      ].join('\n')
    );
  });

  it('keeps each change to a type', async () => {
    const before = await apiReport(
      'interface Options {\n  unit?: string;\n}\nexport { type Options };\n'
    );
    const after = await apiReport(
      'interface Options {\n  unit: string;\n}\nexport { type Options };\n'
    );
    expect(after).not.toBe(before);
  });

  it('gives the committed report for the committed report', async () => {
    // The report is already in the form that apiReport writes, so a new build with the same types
    // matches it.
    const committed = readFileSync(REPORT, 'utf8');
    await expect(apiReport(committed)).resolves.toBe(committed);
  });
});
