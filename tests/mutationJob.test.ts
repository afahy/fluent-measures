import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// AFA-111: CI's mutation job reuses Stryker's results from the last run. GitHub runs the job only
// in CI, so these tests read the workflow.
const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
const job = ci.slice(ci.indexOf('\n  mutation:\n'), ci.indexOf('\n  mutation-changed-lines:'));
const hashed = (/hashFiles\(([^)]*)\)/.exec(job)?.[1] ?? '')
  .split(',')
  .map(pattern => pattern.trim().replace(/^'|'$/g, ''));

describe('the mutation job in CI', () => {
  it('runs Stryker in incremental mode, and every mutant on a push to main', () => {
    expect(job).toContain(
      "run: pnpm test:mutation --incremental ${{ github.event_name == 'push' && '--force' || '' }}"
    );
  });

  it('keeps the incremental file under a key that changes with the inputs', () => {
    expect(job).toContain('path: reports/stryker-incremental.json');
    expect(job).toContain(
      'key: stryker-incremental-${{ steps.inputs.outputs.hash }}-${{ github.sha }}'
    );
    expect(job).toContain('restore-keys: stryker-incremental-${{ steps.inputs.outputs.hash }}-');
    expect(hashed).toEqual(
      expect.arrayContaining([
        'package.json',
        'pnpm-lock.yaml',
        'stryker.config.json',
        'vitest.config.ts',
        'tests/**',
        '!tests/**/*.test.*',
      ])
    );
  });

  // Stryker compares the source files and the test files, but not the files that tests read. A
  // test that reads a file elsewhere needs that file in the hash, or a change to it would reuse
  // stale results. Stryker runs only the tests that import src/.
  const parserTests = readdirSync('tests')
    .filter(name => /\.test\.ts$/.test(name))
    .map(name => [name, readFileSync(join('tests', name), 'utf8')] as const)
    .filter(([, source]) => /from '\.\.\/src[/']/.test(source));
  const read = parserTests.flatMap(([, source]) =>
    [...source.matchAll(/new URL\('([^']+)', import\.meta\.url\)/g)].map(([, url]) =>
      relative('.', join('tests', url))
    )
  );

  it('finds the files that the parser tests read', () => {
    expect(read).toEqual(expect.arrayContaining(['README.md', 'tests/corpus/measurements.jsonl']));
  });

  it.each(read)('hashes %s, which a parser test reads', file => {
    expect(hashed.includes(file) || (file.startsWith('tests/') && !/\.test\./.test(file))).toBe(
      true
    );
  });
});
