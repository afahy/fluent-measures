import { readdirSync, readFileSync } from 'node:fs';
import { join, matchesGlob, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// AFA-111: CI's mutation job reuses Stryker's results from the last run. GitHub runs the job only
// in CI, so these tests read the workflow.
const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
const job = ci.slice(ci.indexOf('\n  mutation:\n'), ci.indexOf('\n  mutation-changed-lines:'));
const hashed = (/hashFiles\(([^)]*)\)/.exec(job)?.[1] ?? '')
  .split(',')
  .map(pattern => pattern.trim().replace(/^'|'$/g, ''));

/** Whether `hashFiles` covers a file: a pattern matches it, and no "!" pattern leaves it out. */
const isHashed = (file: string): boolean =>
  hashed.some(pattern => !pattern.startsWith('!') && matchesGlob(file, pattern)) &&
  !hashed.some(pattern => pattern.startsWith('!') && matchesGlob(file, pattern.slice(1)));

describe('the mutation job in CI', () => {
  it('runs Stryker in incremental mode, from no results on main or a re-run', () => {
    expect(job).toMatch(/^ +run: pnpm test:mutation --incremental$/m);
    expect(job).toContain("if: github.event_name != 'push' && github.run_attempt == 1");
  });

  it('restores and saves the incremental file under a key that changes with the inputs', () => {
    const steps = [...job.matchAll(/uses: (actions\/cache\/\w+)@/g)].map(([, action]) => action);
    expect(steps).toEqual(['actions/cache/restore', 'actions/cache/save']);
    expect(job.match(/path: reports\/stryker-incremental\.json/g)).toHaveLength(2);
    expect(
      job.match(/key: stryker-incremental-\$\{\{ steps\.inputs\.outputs\.hash \}\}-/g)
    ).toHaveLength(2);
    // A key can't be saved twice, so each attempt saves under its own.
    expect(job).toMatch(/key: .*\$\{\{ github\.sha \}\}-\$\{\{ github\.run_attempt \}\}$/m);
    // Only the source files and the test files stay out of the hash, because Stryker compares
    // them itself.
    expect(hashed).toEqual(
      expect.arrayContaining(['package.json', 'pnpm-lock.yaml', 'tests/**', '!tests/**/*.test.ts'])
    );
  });

  // A file that a parser test reads must be in the hash, or a change to it would reuse stale
  // results. Stryker runs only the tests that import src/.
  const parserTests = readdirSync('tests')
    .filter(name => name.endsWith('.test.ts'))
    .map(name => [name, readFileSync(join('tests', name), 'utf8')] as const)
    .filter(([, source]) => /from '\.\.\/src[/']/.test(source));
  const read = parserTests.flatMap(([name, source]) => [
    ...[...source.matchAll(/new URL\('([^']+)', import\.meta\.url\)/g)].map(([, url]) =>
      relative('.', join('tests', url))
    ),
    ...(source.includes('toMatchSnapshot(') ? [`tests/__snapshots__/${name}.snap`] : []),
    // A path in quotes, as in readFileSync('README.md'), is from the repository root.
    ...[...source.matchAll(/readFileSync\('([^']+)'/g)].map(([, file]) => file),
  ]);

  it('finds the files that the parser tests read', () => {
    expect(read).toEqual(
      expect.arrayContaining([
        'README.md',
        'tests/corpus/measurements.jsonl',
        'tests/__snapshots__/corpus.test.ts.snap',
      ])
    );
  });

  // The hash covers the corpus and the README, not a test file, which Stryker compares itself.
  it.each([
    ['README.md', true],
    ['tests/corpus/measurements.jsonl', true],
    ['tests/__snapshots__/corpus.test.ts.snap', true],
    ['tests/corpus.test.ts', false],
    ['src/tokenize.ts', false],
  ])('hashes %s: %s', (file, expected) => {
    expect(isHashed(file)).toBe(expected);
  });

  it.each(read)('hashes %s, which a parser test reads', file => {
    expect(isHashed(file)).toBe(true);
  });
});
