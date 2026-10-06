import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { withoutGitRepository } from './gitEnvironment';

const directories: string[] = [];

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

  // A linked worktree's pre-push hook runs the tests with GIT_DIR set. The tests that start git
  // must pass and must not change the repository that GIT_DIR names.
  it('keeps the tests that run git off the repository in GIT_DIR', { timeout: 120_000 }, () => {
    const sentinel = mkdtempSync(resolve(tmpdir(), 'fluent-measures-sentinel-'));
    directories.push(sentinel);
    execFileSync('git', ['init', '--quiet', '--initial-branch', 'main'], {
      cwd: sentinel,
      env: withoutGitRepository(),
    });
    const config = resolve(sentinel, '.git', 'config');
    const before = readFileSync(config, 'utf8');

    const result = spawnSync(
      'pnpm',
      [
        'exec',
        'vitest',
        'run',
        'tests/prepareCommitMsgHook.test.ts',
        'tests/postCheckoutHook.test.ts',
        'tests/lifecycleScripts.test.ts',
      ],
      {
        encoding: 'utf8',
        env: { ...withoutGitRepository(), GIT_DIR: resolve(sentinel, '.git') },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    expect(readFileSync(config, 'utf8')).toBe(before);
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });
});
