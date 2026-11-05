import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { git, withoutGitRepository } from './gitEnvironment';

vi.mock('node:child_process', { spy: true });

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

// Both config scopes point at a real rejecting hook. Their marker settings also prove that
// ordinary config reads, not just commits, are isolated from the developer's configuration.
function developerGitEnvironment(): Record<string, string> {
  const directory = mkdtempSync(resolve(tmpdir(), 'fluent-measures-git-config-'));
  directories.push(directory);
  const hooks = resolve(directory, 'hooks');
  mkdirSync(hooks);
  writeFileSync(resolve(hooks, 'pre-commit'), '#!/bin/sh\necho developer-hook >&2\nexit 1\n', {
    mode: 0o755,
  });
  for (const scope of ['global', 'system']) {
    writeFileSync(
      resolve(directory, scope),
      `[core]\n  hooksPath = ${JSON.stringify(hooks)}\n[fixture]\n  ${scope} = poison\n`
    );
  }
  return {
    GIT_CONFIG_GLOBAL: resolve(directory, 'global'),
    GIT_CONFIG_SYSTEM: resolve(directory, 'system'),
    GIT_CONFIG_NOSYSTEM: '0',
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
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
    ).toEqual({
      GIT_AUTHOR_NAME: 'Author',
      HOME: '/home/user',
      PATH: '/usr/bin',
      GIT_CONFIG_GLOBAL: devNull,
      GIT_CONFIG_NOSYSTEM: '1',
    });
  });

  it('ignores developer global and system config while keeping local hooks', () => {
    const repository = mkdtempSync(resolve(tmpdir(), 'fluent-measures-git-isolation-'));
    directories.push(repository);
    const inherited = developerGitEnvironment();
    const control = spawnSync('git', ['config', '--get-regexp', '^fixture\\.'], {
      cwd: repository,
      encoding: 'utf8',
      env: { ...withoutGitRepository(), ...inherited },
      timeout: 10_000,
    });
    expect(control.status, control.stderr).toBe(0);
    expect(control.stdout.trim().split('\n').sort()).toEqual([
      'fixture.global poison',
      'fixture.system poison',
    ]);
    for (const [name, value] of Object.entries(inherited)) vi.stubEnv(name, value);

    git(repository, 'init', '--quiet', '--initial-branch', 'main');
    git(repository, 'config', 'user.name', 'Git Test');
    git(repository, 'config', 'user.email', 'git-test@example.invalid');
    expect(git(repository, 'config', '--list')).not.toContain('fixture.');
    git(repository, 'commit', '--quiet', '--allow-empty', '-m', 'test: isolated commit');
    expect(git(repository, 'rev-list', '--count', 'HEAD').trim()).toBe('1');

    writeFileSync(
      resolve(repository, '.git/hooks/pre-commit'),
      '#!/bin/sh\necho local-hook >&2\nexit 1\n',
      { mode: 0o755 }
    );
    expect(() =>
      git(repository, 'commit', '--quiet', '--allow-empty', '-m', 'test: local hook')
    ).toThrow('local-hook');
  });

  it('bounds scratch Git subprocesses', () => {
    const execute = vi.mocked(execFileSync);
    expect(git('.', '--version')).toMatch(/^git version /);
    const options = execute.mock.lastCall?.[2];
    expect(options?.timeout).toBeGreaterThan(0);
    expect(options?.timeout).toBeLessThanOrEqual(10_000);
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
      env: {
        ...withoutGitRepository(),
        ...developerGitEnvironment(),
        GIT_DIR: resolve(sentinel, '.git'),
      },
      timeout: 90_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    expect(readFileSync(config, 'utf8')).toBe(before);
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });
});
