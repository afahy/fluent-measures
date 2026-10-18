import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, matchesGlob, relative } from 'node:path';
import { env } from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';

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

// The patterns of the second hash, which only the keys of main's own results use (AFA-139).
const tools = ([...job.matchAll(/hashFiles\(([^)]*)\)/g)][1]?.[1] ?? '')
  .split(',')
  .map(pattern => pattern.trim().replace(/^'|'$/g, ''));

// The job's steps, each from its "- " line to the next one.
const steps = job.split(/\n(?= {6}- )/).slice(1);
const cacheSteps = (action: 'restore' | 'save', prefix: string): string[] =>
  steps.filter(
    step => step.includes(`uses: actions/cache/${action}@`) && step.includes(`key: ${prefix}-`)
  );
const field = (step: string | undefined, name: string): string | undefined =>
  new RegExp(`^ +(?:- )?${name}: (.*)$`, 'm').exec(step ?? '')?.[1];

const [restore] = cacheSteps('restore', 'stryker-incremental');
const [restoreMain] = cacheSteps('restore', 'stryker-main');
const [save] = cacheSteps('save', 'stryker-incremental');
const [saveMain] = cacheSteps('save', 'stryker-main');
const mutation = steps.find(step => field(step, 'id') === 'mutation');
const startOver = steps.find(step => step.includes('run: rm -f reports/stryker-incremental.json'));

interface Run {
  sha: string;
  stopped?: boolean;
}

/** A key with the values of one run in place of its expressions. */
function keyOf(key: string | undefined, run: Run): string {
  if (key === undefined) throw new Error('The step has no key');
  const values: Record<string, string> = {
    'steps.inputs.outputs.hash': 'inputs',
    'steps.inputs.outputs.tools': 'tools',
    'github.sha': run.sha,
    'github.run_id': '7',
    'github.run_attempt': '1',
    "steps.mutation.outputs.stopped && 'stopped' || 'ended'": run.stopped ? 'stopped' : 'ended',
  };
  return key.replace(
    /\$\{\{ (.+?) \}\}/g,
    (expression, name: string) => values[name] ?? expression
  );
}

/** Whether a restore step finds a saved key, by its exact key or by its prefix in restore-keys. */
function finds(step: string | undefined, run: Run, saved: string): boolean {
  const prefix = field(step, 'restore-keys');
  return (
    keyOf(field(step, 'key'), run) === saved ||
    (prefix !== undefined && saved.startsWith(keyOf(prefix, run)))
  );
}

describe('the mutation job in CI', () => {
  it('runs Stryker in incremental mode, under a time limit', () => {
    expect(mutation).toMatch(
      /^ +timeout --signal=INT 27m pnpm test:mutation --incremental \|\| status=\$\?$/m
    );
  });

  it('restores and saves the incremental file under keys that change with the inputs', () => {
    expect.assertions(9);
    const actions = [...job.matchAll(/uses: (actions\/cache\/\w+)@/g)].map(([, action]) => action);
    expect(actions).toEqual([
      'actions/cache/restore',
      'actions/cache/restore',
      'actions/cache/save',
      'actions/cache/save',
    ]);
    expect(job.match(/path: reports\/stryker-incremental\.json/g)).toHaveLength(4);
    for (const step of [restore, save]) {
      expect(field(step, 'key')).toMatch(
        /^stryker-incremental-\$\{\{ steps\.inputs\.outputs\.hash \}\}-\$\{\{ github\.sha \}\}/
      );
    }
    for (const step of [restoreMain, saveMain]) {
      expect(field(step, 'key')).toMatch(
        /^stryker-main-\$\{\{ steps\.inputs\.outputs\.tools \}\}-\$\{\{ github\.sha \}\}/
      );
    }
    // A key can't be saved twice, so each run and attempt saves under its own (AFA-139: a
    // reopened pull request has the same commit as its last run).
    for (const step of [save, saveMain]) {
      expect(field(step, 'key')).toMatch(
        /-\$\{\{ github\.sha \}\}-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/
      );
    }
    // Only the source files and the test files stay out of the hash, because Stryker compares
    // them itself.
    expect(hashed).toEqual(
      expect.arrayContaining(['package.json', 'pnpm-lock.yaml', 'tests/**', '!tests/**/*.test.ts'])
    );
  });

  it("restores a pull request's own results or main's, on the first attempt only", () => {
    expect(field(restore, 'if')).toBe("github.event_name != 'push' && github.run_attempt == 1");
    const run = { sha: 'merge' };
    expect(finds(restore, run, keyOf(field(save, 'key'), { sha: 'main' }))).toBe(true);
  });

  it("never restores main's own results for a pull request", () => {
    const run = { sha: 'merge' };
    expect(finds(restore, run, keyOf(field(saveMain, 'key'), { sha: 'main', stopped: true }))).toBe(
      false
    );
  });

  // AFA-139: when `timeout` stops a full run on main, a later push to main goes on from its
  // results. It looks for the newest entry of any run on main, because the run of the push before
  // it may not have saved yet.
  it('restores the results of any earlier run on main, on the first attempt only', () => {
    expect(field(restoreMain, 'if')).toBe("github.event_name == 'push' && github.run_attempt == 1");
    const next = { sha: 'third' };
    expect(finds(restoreMain, next, keyOf(field(saveMain, 'key'), { sha: 'first' }))).toBe(true);
    // The results that main saves for pull requests have a different prefix.
    expect(finds(restoreMain, next, keyOf(field(save, 'key'), { sha: 'first' }))).toBe(false);
  });

  it('saves the results of each run on main, with whether timeout stopped it', () => {
    expect(field(saveMain, 'if')).toBe("${{ !cancelled() && github.event_name == 'push' }}");
    expect(keyOf(field(saveMain, 'key'), { sha: 'first', stopped: true })).toBe(
      'stryker-main-tools-first-7-1-stopped'
    );
    expect(keyOf(field(saveMain, 'key'), { sha: 'first', stopped: false })).toBe(
      'stryker-main-tools-first-7-1-ended'
    );
  });

  it("goes on only from a stopped run's results", () => {
    expect(field(restoreMain, 'id')).toBe('main');
    expect(field(startOver, 'if')).toBe(
      "steps.main.outputs.cache-matched-key && !endsWith(steps.main.outputs.cache-matched-key, '-stopped')"
    );
    expect(steps.indexOf(startOver ?? '')).toBeGreaterThan(steps.indexOf(restoreMain ?? ''));
    expect(steps.indexOf(startOver ?? '')).toBeLessThan(steps.indexOf(mutation ?? ''));
  });

  it('keeps the results of a run that went on from a stopped run away from pull requests', () => {
    expect(field(save, 'if')).toBe(
      "${{ !cancelled() && !endsWith(steps.main.outputs.cache-matched-key, '-stopped') }}"
    );
  });

  // Main's own results aren't exact, so their key leaves out the files that tests read. A change
  // to the corpus doesn't stop a later push from going on from them.
  it.each([
    ['package.json', true],
    ['pnpm-lock.yaml', true],
    ['stryker.config.json', true],
    ['vitest.config.ts', true],
    ['tests/corpus/measurements.jsonl', false],
    ['README.md', false],
  ])("main's own results change with %s: %s", (file, expected) => {
    expect(tools.some(pattern => matchesGlob(file, pattern))).toBe(expected);
  });

  // The step's script, as GitHub runs it with `bash -e`, with a `timeout` stub that exits with
  // the given status. `timeout` exits with 124 when it stops the command.
  const directories: string[] = [];
  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
  });

  it.each([
    [0, 0, ''],
    [1, 1, ''],
    [124, 124, 'stopped=true\n'],
  ])('records a stop when timeout exits with %i', (timeoutStatus, stepStatus, output) => {
    const script = (/^ +run: \|\n((?: {10}.*\n)+)/m.exec(mutation ?? '')?.[1] ?? '').replace(
      /^ {10}/gm,
      ''
    );
    const bin = mkdtempSync(join(tmpdir(), 'fluent-measures-timeout-'));
    directories.push(bin);
    writeFileSync(
      join(bin, 'timeout'),
      `#!/bin/sh\necho "$*" > '${join(bin, 'args')}'\nexit ${timeoutStatus}\n`,
      { mode: 0o755 }
    );
    writeFileSync(join(bin, 'output'), '');

    const result = spawnSync('bash', ['-e', '-c', script], {
      env: {
        ...env,
        PATH: `${bin}${delimiter}${env.PATH}`,
        GITHUB_OUTPUT: join(bin, 'output'),
      },
    });

    expect(result.status).toBe(stepStatus);
    expect(readFileSync(join(bin, 'args'), 'utf8')).toBe(
      '--signal=INT 27m pnpm test:mutation --incremental\n'
    );
    expect(readFileSync(join(bin, 'output'), 'utf8')).toBe(output);
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
        'PARSING.md',
        'tests/corpus/measurements.jsonl',
        'tests/__snapshots__/corpus.test.ts.snap',
      ])
    );
  });

  // The hash covers the corpus, the README and PARSING.md, not a test file, which Stryker compares
  // itself.
  it.each([
    ['README.md', true],
    ['PARSING.md', true],
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
