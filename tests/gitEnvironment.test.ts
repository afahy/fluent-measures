import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { git, withoutGitRepository } from './gitEnvironment';

const directories: string[] = [];

// Every other test file that starts a child process. Any of them can run git, so the nested run
// below includes them all, and a new file is checked without a change here.
const childProcessTests = readdirSync('tests')
  .filter(
    file =>
      file.endsWith('.test.ts') &&
      file !== 'gitEnvironment.test.ts' &&
      readFileSync(resolve('tests', file), 'utf8').includes("from 'node:child_process'")
  )
  .map(file => `tests/${file}`);

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('withoutGitRepository', () => {
  it('leaves out the variables that choose a repository and keeps the others', () => {
    expect(
      withoutGitRepository({
        GIT_DIR: '/repo/.git',
        GIT_WORK_TREE: '/repo',
        GIT_INDEX_FILE: '/repo/.git/index',
        GIT_COMMON_DIR: '/repo/.git',
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'core.bare',
        GIT_CONFIG_VALUE_0: 'true',
        GIT_AUTHOR_NAME: 'Author',
        HOME: '/home/user',
        PATH: '/usr/bin',
      })
    ).toEqual({ GIT_AUTHOR_NAME: 'Author', HOME: '/home/user', PATH: '/usr/bin' });
  });

  it('finds the test files that start git', () => {
    expect(childProcessTests).toEqual(
      expect.arrayContaining([
        'tests/lifecycleScripts.test.ts',
        'tests/postCheckoutHook.test.ts',
        'tests/prepareCommitMsgHook.test.ts',
      ])
    );
  });

  // A linked worktree's pre-push hook runs the tests with GIT_DIR set. The tests that start git
  // must pass and must not change the repository that GIT_DIR names.
  it('keeps the tests that run git off the repository in GIT_DIR', { timeout: 120_000 }, () => {
    const sentinel = mkdtempSync(resolve(tmpdir(), 'fluent-measures-sentinel-'));
    directories.push(sentinel);
    git(sentinel, 'init', '--quiet', '--initial-branch', 'main');
    const config = resolve(sentinel, '.git', 'config');
    const before = readFileSync(config, 'utf8');

    const result = spawnSync('pnpm', ['exec', 'vitest', 'run', ...childProcessTests], {
      encoding: 'utf8',
      env: { ...withoutGitRepository(), GIT_DIR: resolve(sentinel, '.git') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    expect(readFileSync(config, 'utf8')).toBe(before);
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });
});
