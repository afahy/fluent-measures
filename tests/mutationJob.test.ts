import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, matchesGlob, relative, resolve } from 'node:path';
import { env } from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';

// AFA-111: CI's mutation jobs reuse Stryker's results from the last run. GitHub runs them only
// in CI, so these tests read the workflow.
const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
const job = ci.slice(ci.indexOf('\n  mutation-inventory:\n'), ci.indexOf('\n  ci-ok:'));
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
    'needs.mutation-inventory.outputs.hash': 'inputs',
    'needs.mutation-inventory.outputs.tools': 'tools',
    'github.sha': run.sha,
    'github.run_id': '7',
    'github.run_attempt': '1',
    "steps.aggregate.outputs.stopped == 'true' && 'stopped' || 'ended'": run.stopped
      ? 'stopped'
      : 'ended',
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
      /^ +timeout --signal=INT 27m pnpm test:mutation \.github\/scripts\/stryker-shard\.config\.mjs --incremental --mutate "\$MUTATE" \|\| status=\$\?$/m
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
        /^stryker-incremental-\$\{\{ (?:steps\.inputs|needs\.mutation-inventory)\.outputs\.hash \}\}-\$\{\{ github\.sha \}\}/
      );
    }
    for (const step of [restoreMain, saveMain]) {
      expect(field(step, 'key')).toMatch(
        /^stryker-main-\$\{\{ (?:steps\.inputs|needs\.mutation-inventory)\.outputs\.tools \}\}-\$\{\{ github\.sha \}\}/
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
    expect(field(saveMain, 'if')).toBe(
      "${{ !cancelled() && steps.aggregate.outputs.valid == 'true' && github.event_name == 'push' }}"
    );
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
      "${{ !cancelled() && steps.aggregate.outputs.valid == 'true' && needs.mutation-inventory.outputs.resumed != 'true' }}"
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
    // A pgrep stand-in that records its arguments and finds no process, so the wait ends at once.
    writeFileSync(
      join(bin, 'pgrep'),
      `#!/bin/sh\necho "$*" >> '${join(bin, 'pgrep.log')}'\nexit 1\n`,
      {
        mode: 0o755,
      }
    );
    writeFileSync(join(bin, 'node'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    writeFileSync(join(bin, 'output'), '');
    writeFileSync(join(bin, 'pgrep.log'), '');
    mkdirSync(join(bin, 'reports/mutation'), { recursive: true });
    writeFileSync(join(bin, 'reports/mutation/mutation.json'), 'stale report');

    const result = spawnSync('bash', ['-e', '-c', script], {
      cwd: bin,
      env: {
        ...env,
        PATH: `${bin}${delimiter}${env.PATH}`,
        GITHUB_OUTPUT: join(bin, 'output'),
        MUTATE: 'src/tokenize.ts',
        MUTATION_SHARD: 'tokenize',
      },
    });

    expect(result.status).toBe(stepStatus);
    expect(existsSync(join(bin, 'reports/mutation/mutation.json'))).toBe(false);
    expect(readFileSync(join(bin, 'args'), 'utf8')).toBe(
      '--signal=INT 27m pnpm test:mutation .github/scripts/stryker-shard.config.mjs --incremental --mutate src/tokenize.ts\n'
    );
    expect(readFileSync(join(bin, 'output'), 'utf8')).toBe(output);
    // Only after a stop does the step wait for Stryker to finish writing its results.
    expect(readFileSync(join(bin, 'pgrep.log'), 'utf8')).toBe(output ? '-f stryker\n' : '');
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

  // The changed-lines filter shares the full run's report. Its annotations must still run when
  // the score fails, while the mutation step's failure must continue to fail the job and ci-ok.
  it('uses one mutation run and keeps it required through ci-ok', () => {
    expect([...ci.matchAll(/pnpm test:mutation/g)]).toHaveLength(1);
    expect(ci).not.toMatch(/^ {2}mutation-changed-lines:/m);
    expect(ci).toContain('needs: [test, package, mutation, mutation-report]');
    expect(mutation).not.toContain('continue-on-error');
    expect(job).not.toContain('continue-on-error');
  });

  it('writes a report without changing the score threshold', () => {
    const config = JSON.parse(readFileSync('stryker.config.json', 'utf8')) as {
      reporters: string[];
      plugins: string[];
      jsonReporter: { fileName: string };
      thresholds: { break: number };
    };
    expect(config.reporters).toContain('mutation-json');
    expect(config.plugins).toContain('./.github/scripts/mutation-report.mjs');
    expect(config.jsonReporter.fileName).toBe('reports/mutation/mutation.json');
    expect(config.thresholds.break).toBe(98);
    expect(mutation).toContain('rm -f reports/mutation/mutation.json reports/mutation-shard.json');
  });

  const filter = steps.find(step => field(step, 'name') === 'Mutants on changed lines are killed');
  const refresh = steps.find(
    step => field(step, 'name') === 'Refresh mutation results for changed source files'
  );

  it('filters the report after a successful or failing mutation run, except when cancelled', () => {
    expect(field(filter, 'if')).toBe(
      "${{ !cancelled() && github.event_name == 'pull_request' && steps.aggregate.outputs.valid == 'true' && steps.aggregate.outputs.stopped == 'false' }}"
    );
    expect(field(filter, 'run')).toBe(
      'node .github/scripts/mutation-check.mjs --report reports/mutation/mutation.json'
    );
    expect(steps.indexOf(filter ?? '')).toBeGreaterThan(steps.indexOf(mutation ?? ''));
    expect(steps.indexOf(filter ?? '')).toBeLessThan(steps.indexOf(save ?? ''));
  });

  it('fetches the merge parents and refreshes changed files after restoring the cache', () => {
    expect(job).toMatch(/uses: actions\/checkout@v4\n +with:\n(?: +#.*\n)* +fetch-depth: 2/);
    expect(field(refresh, 'if')).toBe("github.event_name == 'pull_request'");
    expect(field(refresh, 'run')).toBe(
      'node .github/scripts/mutation-check.mjs --prepare reports/stryker-incremental.json'
    );
    expect(steps.indexOf(refresh ?? '')).toBeGreaterThan(steps.indexOf(restore ?? ''));
    expect(steps.indexOf(refresh ?? '')).toBeLessThan(steps.indexOf(mutation ?? ''));
  });
});

// These checks retain the previous cache/timeout contracts above while following the work
// across prepare, matrix and aggregate jobs (AFA-173).
describe('parallel mutation workflow', () => {
  it('runs four shards in parallel without cancelling the others on failure', () => {
    expect(ci).toContain('shard: [parse-start, parse-end, tokenize, rest]');
    expect(ci).toMatch(/mutation:\n +needs: mutation-inventory[\s\S]*?fail-fast: false/);
    expect(ci).toContain('name: mutation-inputs');
    expect(ci).toContain('name: mutation-shard-${{ matrix.shard }}');
  });

  it('requires aggregation even after a failed shard and rejects missing uploads', () => {
    expect(ci).toContain("if: ${{ !cancelled() && needs.mutation-inventory.result == 'success' }}");
    expect(ci).toContain('needs: [mutation-inventory, mutation]');
    expect(ci.match(/if-no-files-found: error/g)).toHaveLength(3);
    expect(ci).toContain('node .github/scripts/mutation-shards.mjs merge');
    expect(ci).toContain('needs: [test, package, mutation, mutation-report]');
  });

  it('disables only the shard break check and retains the configured aggregate threshold', () => {
    const loaded = spawnSync(
      'node',
      [
        '--input-type=module',
        '-e',
        "import config from './.github/scripts/stryker-shard.config.mjs'; console.log(JSON.stringify(config));",
      ],
      { encoding: 'utf8' }
    );
    expect(loaded.status).toBe(0);
    const config = JSON.parse(loaded.stdout);
    expect(config.thresholds).toEqual({ high: 99, low: 98, break: null });
    expect(JSON.parse(readFileSync('stryker.config.json', 'utf8')).thresholds).toEqual({
      high: 99,
      low: 98,
      break: 98,
    });
  });

  it('hashes shard orchestration that can change cached results', () => {
    expect(isHashed('.github/scripts/mutation-shards.mjs')).toBe(true);
    expect(isHashed('.github/scripts/mutation-inventory.mjs')).toBe(true);
    expect(isHashed('.github/scripts/stryker-shard.config.mjs')).toBe(true);
  });
});

interface Mutant {
  id: string;
  status: string;
  killedBy?: string[];
  coveredBy?: string[];
}
interface Report {
  files: Record<string, { source: string; mutants: Mutant[] }>;
  testFiles: Record<string, { source: string; tests: Array<{ id: string; name: string }> }>;
  filesRead?: Record<string, unknown>;
}
interface Bundle {
  run: string;
  attempt: number;
  inventory: string;
  shard: string;
  state: string;
  report: Report;
}
const shardNames = ['parse-start', 'parse-end', 'tokenize', 'rest'];
const fixturePath = 'tests/fixtures/mutation/shards/';
const inventoryFixture = JSON.parse(readFileSync(`${fixturePath}inventory.json`, 'utf8')) as {
  run: string;
  attempt: number;
  files: Record<string, { source: string }>;
  filesRead?: Record<string, unknown>;
  mutants: string[];
};
const bundleFixtures = shardNames.map(
  shard => JSON.parse(readFileSync(`${fixturePath}${shard}.json`, 'utf8')) as Bundle
);
const shardScript = resolve('.github/scripts/mutation-shards.mjs');
const mergeDirectories: string[] = [];
afterEach(() => {
  for (const directory of mergeDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function mergeFixture(
  bundles = structuredClone(bundleFixtures),
  inventory = structuredClone(inventoryFixture),
  attempt = 1
): { directory: string; status: number | null; output: string } {
  const directory = mkdtempSync(join(tmpdir(), 'fluent-measures-shards-'));
  mergeDirectories.push(directory);
  mkdirSync(join(directory, 'reports/mutation-inputs'), { recursive: true });
  writeFileSync(
    join(directory, 'reports/mutation-inputs/inventory.json'),
    JSON.stringify(inventory)
  );
  writeFileSync(join(directory, 'stryker.config.json'), readFileSync('stryker.config.json'));
  // Sources are the ones recorded by real Stryker, not reconstructed expected mutants.
  for (const [file, result] of Object.entries(bundleFixtures[0].report.testFiles)) {
    mkdirSync(join(directory, file, '..'), { recursive: true });
    writeFileSync(join(directory, file), result.source);
  }
  for (const bundle of bundles) {
    const path = join(directory, 'reports/shards', bundle.shard);
    mkdirSync(path, { recursive: true });
    writeFileSync(join(path, 'mutation-shard.json'), JSON.stringify(bundle));
  }
  const result = spawnSync('node', [shardScript, 'merge'], {
    cwd: directory,
    env: {
      ...env,
      GITHUB_RUN_ID: 'fixture',
      GITHUB_RUN_ATTEMPT: String(attempt),
      GITHUB_SHA: 'head',
      GITHUB_OUTPUT: join(directory, 'output'),
    },
    encoding: 'utf8',
  });
  return { directory, status: result.status, output: result.stdout + result.stderr };
}

function allKilled(): Bundle[] {
  const bundles = structuredClone(bundleFixtures);
  for (const bundle of bundles)
    for (const result of Object.values(bundle.report.files))
      for (const mutant of result.mutants) {
        if (mutant.status !== 'Ignored') mutant.status = 'Killed';
      }
  return bundles;
}

// The fixture has boundary mutants on lines 341 and 342, repeated Stryker ids across shards,
// eight Killed, four Survived, one NoCoverage and one Ignored. The score is 8/13, not an average
// of the shard scores. See fixtures/mutation/README.md for the real full/reuse probes.
describe('merged mutation reports', () => {
  it('merges the current complete inventory and checks one aggregate score', () => {
    const result = mergeFixture();
    expect(result.output).toContain('14/14 mutants, complete');
    expect(result.output).toContain('Aggregate mutation score 61.54; break 98');
    expect(result.status).toBe(1);
    const merged = JSON.parse(
      readFileSync(join(result.directory, 'reports/mutation/mutation.json'), 'utf8')
    ) as Report;
    expect(merged.files['src/parseMeasurement.ts'].mutants).toHaveLength(8);
    expect(merged.filesRead?.['src/parseMeasurement.ts']).toBe(true);
    expect(merged.filesRead?.['src/types.ts']).toBe(true);
    expect(merged.files['src/new.ts'].mutants).toHaveLength(1);
    expect(readFileSync(join(result.directory, 'output'), 'utf8')).toBe(
      'valid=true\nstopped=false\n'
    );
  });

  it('passes when the full score reaches break and remaps shard-local mutant and test ids', () => {
    const bundles = allKilled();
    // Different shards can use the same test id for different tests. Reorder one shard's ids
    // and references together; the aggregate must preserve the definitions the references mean.
    const renamed = bundles[1].report;
    for (const result of Object.values(renamed.testFiles))
      for (const test of result.tests) test.id = `other-${test.id}`;
    for (const result of Object.values(renamed.files))
      for (const mutant of result.mutants) {
        mutant.coveredBy = mutant.coveredBy?.map(id => `other-${id}`);
        mutant.killedBy = mutant.killedBy?.map(id => `other-${id}`);
      }
    const result = mergeFixture(bundles);
    expect(result.status).toBe(0);
    expect(result.output).toContain('Aggregate mutation score 100.00; break 98');
    const merged = JSON.parse(
      readFileSync(join(result.directory, 'reports/stryker-incremental.json'), 'utf8')
    ) as Report;
    const mutants = Object.values(merged.files).flatMap(file => file.mutants);
    expect(new Set(mutants.map(mutant => mutant.id)).size).toBe(14);
    expect(merged.testFiles['tests/units.test.ts'].tests).toHaveLength(6);
    const tests = new Map(
      merged.testFiles['tests/units.test.ts'].tests.map(test => [test.id, test.name])
    );
    expect(
      merged.files['src/parseMeasurement.ts'].mutants
        .flatMap(mutant => mutant.killedBy ?? [])
        .map(id => tests.get(id))
    ).toEqual(['negates', 'negates', 'edge', 'picks']);
  });

  it.each([
    [
      'missing artifact',
      (bundles: Bundle[]): void => {
        bundles.pop();
      },
      /ENOENT/,
    ],
    [
      'missing mutant',
      (bundles: Bundle[]): void => {
        bundles[0].report.files['src/parseMeasurement.ts'].mutants.pop();
      },
      /Missing mutants/,
    ],
    [
      'duplicate mutant',
      (bundles: Bundle[]): void => {
        const mutants = bundles[0].report.files['src/parseMeasurement.ts'].mutants;
        mutants.push(mutants[0]);
      },
      /Duplicate mutant/,
    ],
    [
      'same-count replacement',
      (bundles: Bundle[]): void => {
        const mutants = bundles[0].report.files['src/parseMeasurement.ts'].mutants;
        mutants[1] = mutants[0];
      },
      /Duplicate mutant/,
    ],
    [
      'stale artifact',
      (bundles: Bundle[]): void => {
        bundles[0].run = 'earlier-run';
      },
      /Stale artifact/,
    ],
    [
      'future attempt artifact',
      (bundles: Bundle[]): void => {
        bundles[0].attempt = 2;
      },
      /Stale artifact/,
    ],
    [
      'stale inventory digest',
      (bundles: Bundle[]): void => {
        bundles[0].inventory = 'earlier-inventory';
      },
      /Stale artifact/,
    ],
    [
      'stale source',
      (bundles: Bundle[]): void => {
        bundles[0].report.files['src/parseMeasurement.ts'].source += '// old\n';
      },
      /Stale or unexpected source/,
    ],
    [
      'stale tests',
      (bundles: Bundle[]): void => {
        bundles[0].report.testFiles['tests/units.test.ts'].source += '// old\n';
      },
      /Stale test source/,
    ],
    [
      'incomplete mutant',
      (bundles: Bundle[]): void => {
        bundles[0].report.files['src/parseMeasurement.ts'].mutants[0].status = 'Pending';
      },
      /Incomplete mutant/,
    ],
    [
      'incomplete file selection',
      (bundles: Bundle[]): void => {
        delete bundles[0].report.filesRead?.['src/parseMeasurement.ts'];
      },
      /Incomplete selection/,
    ],
    [
      'range claimed as whole',
      (bundles: Bundle[]): void => {
        bundles[0].report.filesRead!['src/parseMeasurement.ts'] = true;
      },
      /Incomplete selection/,
    ],
    [
      'missing type-only selection',
      (bundles: Bundle[]): void => {
        bundles[3].report.filesRead!['src/types.ts'] = false;
      },
      /Incomplete selection/,
    ],
    [
      'unknown test reference',
      (bundles: Bundle[]): void => {
        bundles[0].report.files['src/parseMeasurement.ts'].mutants[0].coveredBy = ['unknown'];
      },
      /Unknown test id/,
    ],
    [
      'failed shard',
      (bundles: Bundle[]): void => {
        bundles[0].state = 'failed';
      },
      /Failed mutation shard/,
    ],
  ])('fails closed for %s', (_name, edit, message) => {
    const bundles = allKilled();
    edit(bundles);
    const result = mergeFixture(bundles);
    expect(result.status).toBe(1);
    expect(result.output).toMatch(message);
    expect(existsSync(join(result.directory, 'reports/mutation/mutation.json'))).toBe(false);
    expect(existsSync(join(result.directory, 'reports/stryker-incremental.json'))).toBe(false);
    expect(existsSync(join(result.directory, 'output'))).toBe(false);
  });

  it('preserves distinct tests that share a title and have no reported location', () => {
    const bundles = allKilled();
    for (const bundle of bundles) {
      const tests = bundle.report.testFiles['tests/units.test.ts'].tests;
      tests[0].name = 'same title';
      tests[1].name = 'same title';
    }
    const result = mergeFixture(bundles);
    expect(result.status).toBe(0);
    const merged = JSON.parse(
      readFileSync(join(result.directory, 'reports/stryker-incremental.json'), 'utf8')
    ) as Report;
    expect(merged.testFiles['tests/units.test.ts'].tests).toHaveLength(6);
    expect(merged.files['src/parseMeasurement.ts'].mutants[0].killedBy).not.toEqual(
      merged.files['src/parseMeasurement.ts'].mutants[2].killedBy
    );
  });

  it('accepts successful same-run artifacts when GitHub re-runs only failed jobs', () => {
    const result = mergeFixture(allKilled(), structuredClone(inventoryFixture), 2);
    expect(result.status).toBe(0);
    expect(result.output).toContain('14/14 mutants, complete');
  });

  it('fails closed when the independent full inventory loses its actual file selection', () => {
    const inventory = structuredClone(inventoryFixture);
    delete inventory.filesRead;
    const result = mergeFixture(allKilled(), inventory);
    expect(result.status).toBe(1);
    expect(result.output).toContain('Incomplete full mutant inventory');
    expect(existsSync(join(result.directory, 'reports/stryker-incremental.json'))).toBe(false);
  });

  it('rejects results from an earlier prepared input after the prepare job re-runs', () => {
    const inventory = structuredClone(inventoryFixture);
    inventory.attempt = 2;
    const bundles = allKilled();
    const digest = createHash('sha256').update(JSON.stringify(inventory)).digest('hex');
    for (const bundle of bundles) bundle.inventory = digest;
    const result = mergeFixture(bundles, inventory, 2);
    expect(result.status).toBe(1);
    expect(result.output).toContain('Stale artifact');
  });

  it('rejects a stale full inventory', () => {
    const inventory = structuredClone(inventoryFixture);
    inventory.run = 'old-run';
    const result = mergeFixture(allKilled(), inventory);
    expect(result.status).toBe(1);
    expect(result.output).toContain('Stale mutation inventory');
  });

  it('saves a stopped partial cache but fails the job and never marks it complete', () => {
    const bundles = allKilled();
    bundles[1].state = 'stopped';
    bundles[1].report.files['src/parseMeasurement.ts'].mutants.pop();
    delete bundles[1].report.filesRead;
    const result = mergeFixture(bundles);
    expect(result.status).toBe(1);
    expect(result.output).toContain('13/14 mutants, stopped');
    expect(existsSync(join(result.directory, 'reports/mutation/mutation.json'))).toBe(false);
    const cached = JSON.parse(
      readFileSync(join(result.directory, 'reports/stryker-incremental.json'), 'utf8')
    ) as Report;
    expect(cached.filesRead).toBeUndefined();
    expect(Object.values(cached.files).flatMap(file => file.mutants)).toHaveLength(13);
    expect(readFileSync(join(result.directory, 'output'), 'utf8')).toBe(
      'valid=true\nstopped=true\n'
    );
  });

  it('checks inventory identities rather than only its total count', () => {
    const inventory = structuredClone(inventoryFixture);
    inventory.mutants[0] = 'a different mutant';
    const bundles = allKilled();
    const digest = createHash('sha256').update(JSON.stringify(inventory)).digest('hex');
    for (const bundle of bundles) bundle.inventory = digest;
    const result = mergeFixture(bundles, inventory);
    expect(result.status).toBe(1);
    expect(result.output).toContain('Unexpected mutant');
  });
});

// Run the same prepare command as each matrix leg. This also verifies that a cache is trimmed
// before Stryker can carry other shards' results into the report.
describe('mutation shard selection', () => {
  it.each([
    ['parse-start', 'src/parseMeasurement.ts:1-341', 3],
    ['parse-end', 'src/parseMeasurement.ts:342-343', 5],
    ['tokenize', 'src/tokenize.ts', 2],
    ['rest', 'src/**/!(*.spec|*.test).ts,!src/parseMeasurement.ts,!src/tokenize.ts', 4],
  ])('selects %s and trims its restored cache', (shard, patterns, count) => {
    const merged = mergeFixture(allKilled());
    const directory = merged.directory;
    const cached = readFileSync(join(directory, 'reports/stryker-incremental.json'));
    writeFileSync(join(directory, 'reports/mutation-inputs/incremental.json'), cached);
    const output = join(directory, 'prepare-output');
    const prepared = spawnSync('node', [shardScript, 'prepare', shard], {
      cwd: directory,
      env: {
        ...env,
        GITHUB_RUN_ID: 'fixture',
        GITHUB_RUN_ATTEMPT: '1',
        GITHUB_SHA: 'head',
        GITHUB_OUTPUT: output,
      },
      encoding: 'utf8',
    });
    expect(prepared.status).toBe(0);
    expect(readFileSync(output, 'utf8')).toBe(`mutate=${patterns}\n`);
    const report = JSON.parse(
      readFileSync(join(directory, 'reports/stryker-incremental.json'), 'utf8')
    ) as Report;
    expect(Object.values(report.files).flatMap(file => file.mutants)).toHaveLength(count);
    expect(report.testFiles).toEqual(JSON.parse(cached.toString()).testFiles);
  });

  it('discards a leftover cache when the shared input has none', () => {
    const merged = mergeFixture(allKilled());
    const prepared = spawnSync('node', [shardScript, 'prepare', 'rest'], {
      cwd: merged.directory,
      env: {
        ...env,
        GITHUB_RUN_ID: 'fixture',
        GITHUB_RUN_ATTEMPT: '1',
        GITHUB_SHA: 'head',
        GITHUB_OUTPUT: join(merged.directory, 'prepare-output'),
      },
      encoding: 'utf8',
    });
    expect(prepared.status).toBe(0);
    expect(existsSync(join(merged.directory, 'reports/stryker-incremental.json'))).toBe(false);
  });
});

describe('repeated mutation attempts', () => {
  it('ignores the shared incremental input on a repeated attempt', () => {
    const merged = mergeFixture(allKilled());
    writeFileSync(
      join(merged.directory, 'reports/mutation-inputs/incremental.json'),
      readFileSync(join(merged.directory, 'reports/stryker-incremental.json'))
    );
    const prepared = spawnSync('node', [shardScript, 'prepare', 'rest'], {
      cwd: merged.directory,
      env: {
        ...env,
        GITHUB_RUN_ID: 'fixture',
        GITHUB_RUN_ATTEMPT: '2',
        GITHUB_SHA: 'head',
        GITHUB_OUTPUT: join(merged.directory, 'prepare-output'),
      },
      encoding: 'utf8',
    });
    expect(prepared.status).toBe(0);
    expect(existsSync(join(merged.directory, 'reports/stryker-incremental.json'))).toBe(false);
    expect(ci.match(/overwrite: true/g)).toHaveLength(3);
  });
});
