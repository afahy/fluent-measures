import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import config from '../vitest.config';

const directories: string[] = [];
const sourceFiles = ['src/nested/unused.ts', 'src/value.ts'];

type Metric = { total: number; covered: number; pct: number | string };
type Summary = Record<'branches' | 'functions' | 'lines' | 'statements', Metric>;

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

// Run the installed V8 provider, including its untested-file discovery and threshold checks.
// Copy the real config so its project root is the fixture, rather than this checkout. These are
// temporary fixtures, not additional git checkouts.
function runCoverage(
  ancestor: string,
  coverAll: boolean
): {
  status: number | null;
  output: string;
  files: string[];
  summary: Summary;
} {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'fluent-measures-coverage-')));
  directories.push(directory);
  const root = join(directory, ancestor, 'repository');
  const files: Record<string, string> = {
    'package.json': '{"type":"module"}',
    'vitest.config.ts': readFileSync(new URL('../vitest.config.ts', import.meta.url), 'utf8'),
    'src/value.ts': 'export function value(enabled: boolean) { if (enabled) return 42; return 0; }',
    'src/nested/unused.ts': 'export function unused() { return 7; }',
    // None of these functions is called. Including any of them must fail the 100% threshold.
    'src/.hidden.ts': 'export function hidden() { return 1; }',
    'src/.github/tool.ts': 'export function hidden() { return 1; }',
    'src/.stryker-tmp/tool.ts': 'export function hidden() { return 1; }',
    'src/nested/.hidden.ts': 'export function hidden() { return 1; }',
    'src/nested/.cache/tool.ts': 'export function hidden() { return 1; }',
    '.github/tool.ts': 'export function outside() { return 1; }',
    '.stryker-tmp/tool.ts': 'export function outside() { return 1; }',
    'other/tool.ts': 'export function outside() { return 1; }',
    // Keep fixture imports separate from this test: the mutation-cache check scans test
    // imports to find tests of this repository's parser, not this temporary source tree.
    'tests/value.test.ts': readFileSync(
      new URL('./fixtures/coverage-config/value.test.ts.txt', import.meta.url),
      'utf8'
    ),
  };
  for (const [file, contents] of Object.entries(files)) {
    const path = join(root, file);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, contents);
  }
  symlinkSync(
    fileURLToPath(new URL('../node_modules', import.meta.url)),
    join(root, 'node_modules'),
    'junction'
  );
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url)),
      'run',
      '--coverage',
      '--coverage.reporter=json',
      '--coverage.reporter=json-summary',
    ],
    {
      cwd: root,
      encoding: 'utf8',
      timeout: 20_000,
      env: { ...process.env, COVERAGE_FIXTURE_COVER_ALL: String(coverAll) },
    }
  );
  if (result.error) throw result.error;
  const coverage = JSON.parse(readFileSync(join(root, 'coverage/coverage-final.json'), 'utf8'));
  const summary = JSON.parse(readFileSync(join(root, 'coverage/coverage-summary.json'), 'utf8'));
  return {
    status: result.status,
    output: result.stdout + result.stderr,
    files: Object.keys(coverage)
      .map(file => relative(root, file).replace(/\\/g, '/'))
      .sort(),
    summary: summary.total,
  };
}

describe('coverage configuration', () => {
  it('keeps the src file set and all four 100% thresholds', () => {
    expect(config.test?.coverage?.include).toEqual(['src/**']);
    expect(config.test?.coverage?.thresholds).toEqual({
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    });
  });

  // AFA-193: **/[.]** matched an absolute checkout path's .t3 or .codex ancestor,
  // producing an empty report that passed all thresholds. Every location must cover the
  // same visible source files and reject the same deliberately uncovered function.
  describe.each(['ordinary', '.t3/worktrees', '.codex/worktrees'])('under %s', ancestor => {
    it(
      'reports the intended files at 100% and excludes repository dot paths',
      { timeout: 30_000 },
      () => {
        const result = runCoverage(ancestor, true);
        expect(result.status, result.output).toBe(0);
        expect(result.files).toEqual(sourceFiles);
        expect(result.summary).toMatchObject({
          branches: expect.objectContaining({ total: 2, covered: 2, pct: 100 }),
          functions: expect.objectContaining({ total: 2, covered: 2, pct: 100 }),
          lines: expect.objectContaining({ pct: 100 }),
          statements: expect.objectContaining({ pct: 100 }),
        });
      }
    );

    it('fails coverage when one of two source functions is untested', { timeout: 30_000 }, () => {
      const result = runCoverage(ancestor, false);
      expect(result.status, JSON.stringify(result)).toBe(1);
      expect(result.files).toEqual(sourceFiles);
      expect(result.summary.functions).toEqual({ total: 2, covered: 1, skipped: 0, pct: 50 });
      expect(result.output).toContain('does not meet global threshold (100%)');
    });
  });
});
