import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { replayCorpus } from '../.github/scripts/evidence.mjs';
import { git, withoutGitRepository } from './gitEnvironment';

const script = resolve('.github/scripts/evidence.mjs');
const buildScript = resolve('.github/scripts/evidence-build.mjs');
const corpusPath = 'tests/corpus/measurements.jsonl';
const directories: string[] = [];
const feet = { value: 6, unit: 'ft', type: 'height' };
const inches = { value: 72, unit: 'in', type: 'height' };
// Literal module source keeps the controlled fixtures independent of expected-value objects.
const feetSource = '{ value: 6, unit: "ft", type: "height" }';
const inchesSource = '{ value: 72, unit: "in", type: "height" }';
const parseFeet = `export function parseMeasurement() { return ${feetSource}; }`;
const parseInches = `export function parseMeasurement() { return ${inchesSource}; }`;

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function directory(): string {
  const path = mkdtempSync(resolve(tmpdir(), 'fluent-measures-evidence-'));
  directories.push(path);
  return path;
}

function write(root: string, path: string, contents: string): string {
  const file = resolve(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
  return file;
}

function entry(change: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: 'accepted',
    input: '6 ft',
    expected: feet,
    category: 'symbols',
    source: 'handwritten',
    ...change,
  });
}

function fixture(base: string, head: string): string {
  const root = directory();
  git(root, 'init', '--initial-branch', 'main');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'commit.gpgsign', 'false');
  git(root, 'config', 'core.hooksPath', '/dev/null');
  write(root, 'package.json', '{"type":"module"}');
  write(root, corpusPath, base);
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'test: base');
  write(root, corpusPath, head);
  git(root, 'add', '.');
  git(root, 'commit', '--allow-empty', '-m', 'test: head');
  write(root, 'base-build/dist/index.js', parseFeet);
  write(root, 'head-build/dist/index.js', parseInches);
  return root;
}

function run(
  root: string,
  env: Record<string, string> = {}
): { status: number | null; text: string; log: string } {
  const summary = write(root, 'summary.md', '');
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: 'utf8',
    timeout: 10_000,
    env: {
      ...withoutGitRepository(),
      PR_BODY: '',
      GITHUB_STEP_SUMMARY: summary,
      CORPUS_BASE_MODULE: resolve(root, 'base-build/dist/index.js'),
      CORPUS_HEAD_MODULE: resolve(root, 'head-build/dist/index.js'),
      BUILD_BASE: '',
      BUILD_HEAD: '',
      SIZE_BASE: '',
      SIZE_HEAD: '',
      ...env,
    },
  });
  return {
    status: result.status,
    text: readFileSync(summary, 'utf8'),
    log: result.stdout + result.stderr,
  };
}

describe('Evidence corpus replay regressions', () => {
  // AFA-167: neither single-output accepted result is present in the corpus score report.
  // The fixture's six feet and 72 inches are hand calculated; neither expectation supplies the
  // actual result, which comes from each revision's separate built-module fixture.
  it('requires disclosure when an expected-output edit hides two accepted actual outputs', () => {
    const root = fixture(entry(), entry({ expected: inches }));
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.log).toContain('changes 1 results');
    expect(result.text).toContain(
      '| <code>accepted</code> | <code>"6 ft"</code> | <code>{}</code> | <code>6 ft (height)</code> | <code>72 in (height)</code> |'
    );
    expect(result.text).toContain('Risk: **high**');
    expect(
      run(root, { PR_BODY: '# Description\n\nChanged results: the requested conversion.' }).status
    ).toBe(0);
  });

  it('compares a new entry absent from the base report with the same head options on both builds', () => {
    const root = fixture('', entry({ options: { normalizedUnit: 'in' }, expected: inches }));
    // Both workers must receive the head input/options. Reading base corpus inputs or dropping
    // options produces a different result and fails the table assertion.
    write(
      root,
      'base-build/dist/index.js',
      `export function parseMeasurement(input, options) {
      return input === '6 ft' && options?.normalizedUnit === 'in' ? null : ${feetSource};
    }`
    );
    write(
      root,
      'head-build/dist/index.js',
      `export function parseMeasurement(input, options) {
      return input === '6 ft' && options?.normalizedUnit === 'in' ? ${inchesSource} : null;
    }`
    );
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.text).toContain(
      '| <code>accepted</code> | <code>"6 ft"</code> | <code>{"normalizedUnit":"in"}</code> | <code>null</code> | <code>72 in (height)</code> |'
    );
    expect(result.text).toContain('Risk: **medium**');
    expect(result.text).toContain('New entries: 1.');
  });

  it('replays an edited input using the head input on both revisions', () => {
    const root = fixture(entry({ input: '5 ft' }), entry());
    write(
      root,
      'base-build/dist/index.js',
      `export function parseMeasurement(input) { return input === '6 ft' ? null : ${feetSource}; }`
    );
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.text).toContain('<code>null</code> | <code>72 in (height)</code>');
  });

  it('replays semantically edited options on the same input in both revisions', () => {
    const root = fixture(entry(), entry({ options: { normalizedUnit: 'in' } }));
    write(
      root,
      'base-build/dist/index.js',
      `export function parseMeasurement(input, options) { return options?.normalizedUnit === 'in' ? null : ${feetSource}; }`
    );
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.text).toContain(
      '<code>{"normalizedUnit":"in"}</code> | <code>null</code> | <code>72 in (height)</code>'
    );
  });

  it('compares each replayed result and ignores changes to raw text fields', () => {
    const head = [entry(), entry({ id: 'unchanged' }), entry({ id: 'error' })].join('\n');
    const root = fixture('', head);
    write(
      root,
      'base-build/dist/index.js',
      `export function parseMeasurement() { return { ...${feetSource}, raw: 'base' }; }`
    );
    // The first and last results change; the middle one only changes a field outside the corpus
    // measurement (value/unit/type). Expected outputs have no part in this comparison.
    write(
      root,
      'head-build/dist/index.js',
      `let calls = 0; export function parseMeasurement() {
      calls += 1;
      if (calls === 1) return ${inchesSource};
      if (calls === 3) throw new TypeError('bad unit');
      return { ...${feetSource}, raw: 'head' };
    }`
    );
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.log).toContain('changes 2 results');
    expect(result.text).toContain('<code>accepted</code>');
    expect(result.text).toContain('<code>error</code>');
    expect(result.text).toContain('throws TypeError: bad unit');
    expect(result.text).not.toContain('<code>unchanged</code>');
  });

  it('reports parser exceptions as actual results independently of expectations', () => {
    const root = fixture('', entry({ expected: null }));
    write(
      root,
      'base-build/dist/index.js',
      'export function parseMeasurement() { throw new RangeError("cannot convert"); }'
    );
    write(root, 'head-build/dist/index.js', 'export function parseMeasurement() { return null; }');
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.text).toContain(
      '<code>throws RangeError: cannot convert</code> | <code>null</code>'
    );
  });

  it('preserves nonfinite corpus options when replaying both revisions', () => {
    const line = entry({ options: { fuzziness: 'INFINITY' } }).replace('"INFINITY"', '1e999');
    const root = fixture('', line);
    write(
      root,
      'head-build/dist/index.js',
      `export function parseMeasurement(input, options) { return options?.fuzziness === Infinity ? ${inchesSource} : null; }`
    );
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.text).toContain('<code>{"fuzziness":"Infinity"}</code>');
    expect(result.text).toContain('<code>6 ft (height)</code> | <code>72 in (height)</code>');
  });

  it.each([
    [
      'metadata',
      entry(),
      entry({ category: 'words', source: 'AFA-167', note: 'more context' }),
      'low',
    ],
    ['expected outputs', entry(), entry({ expected: [feet, inches] }), 'high'],
    ['a new entry', '', entry(), 'low'],
    ['options', entry(), entry({ options: { normalizedUnit: 'ft' } }), 'high'],
  ])(
    'keeps the outcome and risk for unchanged actual results after editing %s',
    (_, base, head, risk) => {
      const root = fixture(base, head);
      write(root, 'head-build/dist/index.js', parseFeet);
      const result = run(root);
      expect(result.status).toBe(0);
      expect(result.text).toContain(`Risk: **${risk}**`);
      expect(result.text).not.toContain('Actual results for');
      expect(result.log).not.toContain('::error::');
    }
  );

  it('does not replay metadata-only edits, even if the parsers would disagree', () => {
    const root = fixture(entry(), entry({ note: 'a comment' }));
    const result = run(root);
    expect(result.status).toBe(0);
    expect(result.text).toContain('Risk: **low**');
    expect(result.text).not.toContain('72 in');
  });

  it('makes a missing base build explicit while preserving the previous no-result outcome', () => {
    const root = fixture('', entry());
    rmSync(resolve(root, 'base-build/dist'), { recursive: true });
    const result = run(root);
    expect(result.status).toBe(0);
    expect(result.text).toContain('main: corpus replay unavailable; the built module is missing.');
    expect(result.text).not.toContain('Actual results for');
  });

  it('distinguishes a failed module import from a parser exception', () => {
    const root = fixture('', entry());
    write(root, 'base-build/dist/index.js', 'throw new Error("module load failed");');
    const result = run(root);
    expect(result.status).toBe(0);
    expect(result.text).toContain('main: corpus replay unavailable; worker exited 1');
    expect(result.text).toContain('module load failed');
    expect(result.text).not.toContain('Actual results for');
  });

  it('reports a stalled replay worker as unavailable', () => {
    const root = fixture('', entry());
    // Simulate a stalled revision without leaving an infinite child process on a broken rule.
    write(
      root,
      'base-build/dist/index.js',
      'export function parseMeasurement() { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000); return null; }'
    );
    const result = replayCorpus(
      [entry()],
      resolve(root, 'base-build/dist/index.js'),
      resolve(root, 'head-build/dist/index.js'),
      1000
    );
    expect(result.changed).toEqual([]);
    expect(result.unavailable).toHaveLength(1);
    expect(result.unavailable[0]).toContain('main: corpus replay unavailable; worker');
    expect(result.unavailable[0]).toContain('ETIMEDOUT');
  }, 15_000);

  it('reports malformed replay output instead of treating it as no result change', () => {
    const root = fixture('', entry());
    write(root, 'base-build/dist/index.js', `console.log('unexpected parser log'); ${parseFeet}`);
    const result = run(root);
    expect(result.status).toBe(0);
    expect(result.text).toContain(
      'main: corpus replay unavailable; the worker returned invalid output.'
    );
    expect(result.text).not.toContain('Actual results for');
  });

  it.each(['missing', 'not JSON', '{}', '[1]'])(
    'explains %s build diagnostics in the summary',
    diagnostics => {
      const root = fixture('', entry());
      const path =
        diagnostics === 'missing'
          ? resolve(root, 'absent.json')
          : write(root, 'build-base.json', diagnostics);
      const result = run(root, { BUILD_BASE: path });
      expect(result.text).toContain(
        'main: setup/install/build/measurement evidence unavailable; no valid diagnostics were recorded.'
      );
    }
  );

  it('shows missing base setup evidence beside available head sizes', () => {
    const root = fixture('', entry());
    const result = run(root, {
      BUILD_BASE: write(
        root,
        'build-base.json',
        JSON.stringify([
          'pnpm setup unavailable (failure); install, build and size measurement were not run.',
        ])
      ),
      BUILD_HEAD: write(root, 'build-head.json', '[]'),
      SIZE_HEAD: write(root, 'size-head.json', '[{"name":"dist/index.js","size":110}]'),
    });
    expect(result.text).toContain(
      'main: pnpm setup unavailable (failure); install, build and size measurement were not run.'
    );
    expect(result.text).toContain('| <code>dist/index.js</code> |  | 110 B |  |');
  });
});

describe('Evidence build diagnostics', () => {
  function measure(
    failAt = '',
    output = '[{"name":"dist/index.js","size":110}]',
    setup = 'success',
    requireInstall = false
  ): { status: number | null; diagnostics: string; commands: string; size: string } {
    const root = directory();
    const log = write(root, 'commands', '');
    const pnpm = write(
      root,
      'bin/pnpm',
      `#!/bin/sh
printf '%s\\n' "$*" >> "$EVIDENCE_COMMANDS"
if [ "$1" = "$EVIDENCE_FAIL_AT" ]; then exit 7; fi
if [ "$1" = exec ]; then printf '%s' "$EVIDENCE_SIZE_OUTPUT"; exit "\${EVIDENCE_SIZE_EXIT:-0}"; fi
`
    );
    // Avoid changing the developer's pnpm; the fixture command is first on PATH only in its child.
    const chmod = spawnSync('chmod', ['+x', pnpm]);
    if (chmod.status !== 0) throw new Error('could not prepare fixture pnpm');
    const diagnostics = resolve(root, 'diagnostics.json');
    const size = resolve(root, 'size.json');
    const result = spawnSync(
      process.execPath,
      [
        buildScript,
        root,
        diagnostics,
        size,
        setup,
        ...(requireInstall ? ['--require-install'] : []),
      ],
      {
        encoding: 'utf8',
        env: {
          ...withoutGitRepository(),
          PATH: `${dirname(pnpm)}${delimiter}${process.env.PATH}`,
          EVIDENCE_COMMANDS: log,
          EVIDENCE_FAIL_AT: failAt,
          EVIDENCE_SIZE_OUTPUT: output,
          EVIDENCE_SIZE_EXIT: '1',
        },
      }
    );
    return {
      status: result.status,
      diagnostics: readFileSync(diagnostics, 'utf8'),
      commands: readFileSync(log, 'utf8'),
      size,
    };
  }

  it('records a failed setup and runs no package command', () => {
    const result = measure('', '', 'failure');
    expect(result.status).toBe(0);
    expect(result.commands).toBe('');
    expect(JSON.parse(result.diagnostics)).toEqual([
      'pnpm setup unavailable (failure); install, build and size measurement were not run.',
    ]);
  });

  it.each([
    ['install', 'dependency installation unavailable', 'install --frozen-lockfile\n'],
    ['build', 'build unavailable', 'install --frozen-lockfile\nbuild\n'],
    [
      'exec',
      'size measurement unavailable',
      'install --frozen-lockfile\nbuild\nexec size-limit --json\n',
    ],
  ])('makes a failed %s explicit and stops dependent measurements', (stage, message, commands) => {
    const result = measure(stage);
    expect(result.status).toBe(0);
    expect(result.commands).toBe(commands);
    expect(result.diagnostics).toContain(message);
    expect(result.diagnostics).toContain('exit 7');
  });

  it.each([
    ['setup', '', 'failure', 1],
    ['install', 'install', 'success', 1],
    ['build', 'build', 'success', 0],
    ['measurement', 'exec', 'success', 0],
  ])('preserves the old head job outcome after %s failure', (_, failAt, setup, status) => {
    const result = measure(failAt, '', setup, true);
    expect(result.status).toBe(status);
    expect(JSON.parse(result.diagnostics)).toHaveLength(1);
  });

  it('keeps valid sizes even when size-limit exits nonzero for an exceeded budget', () => {
    const result = measure();
    expect(result.status).toBe(0);
    expect(JSON.parse(result.diagnostics)).toEqual([]);
    expect(JSON.parse(readFileSync(result.size, 'utf8'))).toEqual([
      { name: 'dist/index.js', size: 110 },
    ]);
  });

  it.each(['not JSON', '[]', '{}', '[{"name":"dist/index.js"}]'])(
    'explains unusable measurement output %s',
    output => {
      const result = measure('', output);
      expect(result.diagnostics).toContain('size measurement unavailable');
      expect(result.diagnostics).toContain('no valid sizes were recorded');
    }
  );

  it('passes a workspace-relative base package path to the pinned pnpm action', () => {
    const root = fixture('', entry());
    write(root, 'package.json', '{"type":"module","packageManager":"pnpm@9.15.9"}');
    git(root, 'add', 'package.json');
    git(root, 'commit', '-m', 'test: base package manager');
    write(root, 'package.json', '{"type":"module","packageManager":"pnpm@10.10.0"}');
    git(root, 'add', 'package.json');
    git(root, 'commit', '-m', 'test: head package manager');
    const runnerTemp = resolve(directory(), 'runner temp');
    mkdirSync(runnerTemp);
    const output = write(root, 'step-output', '');
    const workflow = readFileSync('.github/workflows/evidence.yml', 'utf8');
    const checkout = workflow.slice(
      workflow.indexOf('      - name: Check out the base build'),
      workflow.indexOf("      - name: Set up the PR's pnpm")
    );
    const run = checkout.match(/run: (.*)/)?.[1];
    expect(run).toBeDefined();
    const command =
      run === '|'
        ? checkout
            .slice(checkout.indexOf('run: |\n') + 'run: |\n'.length)
            .split('\n')
            .map(line => line.slice(10))
            .join('\n')
        : String(run);
    const result = spawnSync('bash', ['-e', '-c', command], {
      cwd: root,
      encoding: 'utf8',
      timeout: 10_000,
      env: {
        ...withoutGitRepository(),
        GITHUB_WORKSPACE: root,
        RUNNER_TEMP: runnerTemp,
        GITHUB_OUTPUT: output,
      },
    });
    expect(result.status, result.stderr).toBe(0);
    const emitted = readFileSync(output, 'utf8').match(/^package_json=(.*)$/m)?.[1] ?? '';
    const baseSetup = workflow.slice(
      workflow.indexOf("      - name: Set up the base revision's pnpm"),
      workflow.indexOf('      - name: Build and measure the base revision')
    );
    const setting = baseSetup.match(/package_json_file: (.*)/)?.[1] ?? '';
    const packageJsonFile = setting
      .replace('${{ runner.temp }}', runnerTemp)
      .replace('${{ steps.base-checkout.outputs.package_json }}', emitted);
    expect(isAbsolute(packageJsonFile)).toBe(false);
    // Pinned pnpm/action-setup run.ts reads path.join(GITHUB_WORKSPACE, packageJsonFile).
    // Using resolve instead would hide the absolute-path regression in that external contract.
    const selected = join(root, packageJsonFile);
    expect(selected).toBe(join(runnerTemp, 'base/package.json'));
    expect(JSON.parse(readFileSync(selected, 'utf8')).packageManager).toBe('pnpm@9.15.9');
    expect(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).packageManager).toBe(
      'pnpm@10.10.0'
    );
  }, 15_000);

  it('sets up base pnpm from the base package before installing its lockfile', () => {
    const workflow = readFileSync('.github/workflows/evidence.yml', 'utf8');
    const baseSetup = workflow.slice(
      workflow.indexOf("      - name: Set up the base revision's pnpm"),
      workflow.indexOf('      - name: Build and measure the base revision')
    );
    expect(baseSetup).toContain('uses: pnpm/action-setup@');
    expect(baseSetup).toContain(
      'package_json_file: ${{ steps.base-checkout.outputs.package_json }}'
    );
    expect(baseSetup).toContain('dest: ${{ runner.temp }}/pnpm-base');
    expect(workflow).toContain('tsup.config.ts tests/corpus/measurements.jsonl; then');
    expect(workflow).toContain('CORPUS_BASE_MODULE: ${{ runner.temp }}/base/dist/index.js');
    expect(workflow).toContain('CORPUS_HEAD_MODULE: ${{ github.workspace }}/dist/index.js');
    expect(workflow).toContain('BUILD_BASE: ${{ runner.temp }}/build-base.json');
    expect(workflow).toContain('"$RUNNER_TEMP/size-head.json" "$PNPM_SETUP" --require-install');
    expect(workflow).toContain(
      '      - name: Summarize the changed results and rate the risk\n        if: always()'
    );
  });
});
