import { execFileSync, spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism, devNull, tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { git, withoutGitRepository } from './gitEnvironment';

vi.mock('node:child_process', { spy: true });

const directories: string[] = [];
const vitest = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));

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

// Verify the real nested suite, or exercise its failure path with an injected spawn result.
function verifyGitIsolation(): void {
  const sentinel = mkdtempSync(resolve(tmpdir(), 'fluent-measures-sentinel-'));
  directories.push(sentinel);
  git(sentinel, 'init', '--quiet', '--initial-branch', 'main');
  const config = resolve(sentinel, '.git', 'config');
  const before = readFileSync(config, 'utf8');

  const started = performance.now();
  // Use this worker's Node binary, rather than whichever Node a package-manager shim finds.
  const result = spawnSync(process.execPath, [vitest, 'run', ...childProcessTests], {
    encoding: 'utf8',
    env: {
      ...withoutGitRepository(),
      ...developerGitEnvironment(),
      GIT_DIR: resolve(sentinel, '.git'),
    },
    timeout: 90_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // A null status alone hid the cause of the 90-second failure on main (AFA-204). Print a
  // compact summary on success too, so hosted timings and the runtime remain observable.
  const diagnostic = JSON.stringify({
    node: process.version,
    execPath: process.execPath,
    platform: process.platform,
    arch: process.arch,
    availableParallelism: availableParallelism(),
    elapsedMs: Math.round(performance.now() - started),
    status: result.status,
    signal: result.signal,
    error: result.error
      ? { message: result.error.message, code: (result.error as NodeJS.ErrnoException).code }
      : null,
  });
  process.stdout.write(`Git isolation: ${diagnostic}\n`);
  const output = `${diagnostic}\n${result.stdout}${result.stderr}`;

  expect(readFileSync(config, 'utf8'), output).toBe(before);
  expect(result.error, output).toBeUndefined();
  expect(result.status, output).toBe(0);
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
    verifyGitIsolation();
    expect(vi.mocked(spawnSync).mock.lastCall?.[0]).toBe(process.execPath);
  });

  // Reproduce main's null-status/90,074ms failure shape without another nested suite or a
  // 90-second wait. The injected error and signal are test cases, not a claim about that run.
  it.each([
    { status: null, signal: 'SIGTERM', code: 'ETIMEDOUT' },
    { status: null, signal: 'SIGKILL', code: null },
    { status: 1, signal: null, code: null },
    { status: 0, signal: null, code: 'ETIMEDOUT' },
  ] as const)('reports a nested failure with %j', failure => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(100);
    const log = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const execute = vi.mocked(spawnSync).mockImplementationOnce(() => {
      clock.mockReturnValue(90_174);
      const result: SpawnSyncReturns<string> = {
        pid: 1,
        output: [null, 'nested stdout', 'nested stderr'],
        stdout: 'nested stdout',
        stderr: 'nested stderr',
        status: failure.status,
        signal: failure.signal,
        error: failure.code
          ? Object.assign(new Error('nested spawn failed'), { code: failure.code })
          : undefined,
      };
      return result;
    });

    expect(verifyGitIsolation).toThrow('nested stdoutnested stderr');
    const line = String(log.mock.lastCall?.[0]);
    expect(line).toMatch(/^Git isolation: /);
    expect(JSON.parse(line.slice('Git isolation: '.length))).toEqual({
      node: process.version,
      execPath: process.execPath,
      platform: process.platform,
      arch: process.arch,
      availableParallelism: availableParallelism(),
      elapsedMs: 90_074,
      status: failure.status,
      signal: failure.signal,
      error: failure.code ? { message: 'nested spawn failed', code: failure.code } : null,
    });
    expect(execute.mock.lastCall?.[0]).toBe(process.execPath);
    expect(execute.mock.lastCall?.[1]).toEqual(
      expect.arrayContaining([
        'run',
        'tests/lifecycleScripts.test.ts',
        'tests/postCheckoutHook.test.ts',
        'tests/prepareCommitMsgHook.test.ts',
      ])
    );
    expect(execute.mock.lastCall?.[2]).toMatchObject({
      timeout: 90_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  });

  it('rejects a successful nested run that changes the sentinel config', () => {
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.mocked(spawnSync).mockImplementationOnce((_command, _args, options) => {
      const directory = options?.env?.GIT_DIR;
      if (!directory) throw new Error('Missing sentinel GIT_DIR');
      writeFileSync(resolve(directory, 'config'), 'changed sentinel config');
      const result: SpawnSyncReturns<string> = {
        pid: 1,
        output: [null, '', ''],
        stdout: '',
        stderr: '',
        status: 0,
        signal: null,
      };
      return result;
    });
    expect(verifyGitIsolation).toThrow('changed sentinel config');
  });
});
