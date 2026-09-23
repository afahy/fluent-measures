import { execFileSync, spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, resolve } from 'node:path';
import { env } from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';

const hook = resolve('.husky/post-checkout');
const directories: string[] = [];

function createDirectory(prefix: string): string {
  const directory = mkdtempSync(resolve(tmpdir(), prefix));
  directories.push(directory);
  return directory;
}

function head(repository: string): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim();
}

function commit(repository: string, file: string, content: string): string {
  writeFileSync(resolve(repository, file), content);
  execFileSync('git', ['add', file], { cwd: repository });
  execFileSync('git', ['commit', '-m', `test: update ${file}`], { cwd: repository });
  return head(repository);
}

function createRepository(objectFormat: 'sha1' | 'sha256' = 'sha1'): string {
  const repository = createDirectory('fluent-measures-hook-');

  execFileSync('git', ['init', '--initial-branch', 'main', '--object-format', objectFormat], {
    cwd: repository,
  });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repository });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repository });
  // Don't sign fixture commits with the developer's key, which may prompt for a passphrase.
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: repository });
  commit(repository, 'package.json', '{ "version": "1.0.0" }\n');

  return repository;
}

// A `pnpm` stub that records its arguments, so the hook never runs a real install.
function createPnpmStub(): { path: string; calls: () => string[] } {
  const bin = createDirectory('fluent-measures-pnpm-');
  const log = resolve(bin, 'calls.log');
  writeFileSync(resolve(bin, 'pnpm'), `#!/bin/sh\necho "$*" >> '${log}'\n`, { mode: 0o755 });

  return {
    path: `${bin}${delimiter}${env.PATH}`,
    calls: () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []),
  };
}

// Installs the hook the way Husky runs it, with `sh -e`. Returns a function that reads the
// arguments git passed to it.
function installHook(repository: string): () => string {
  const hooks = createDirectory('fluent-measures-hooks-');
  const record = resolve(hooks, 'args');
  writeFileSync(
    resolve(hooks, 'post-checkout'),
    `#!/bin/sh\necho "$*" > '${record}'\nexec sh -e '${hook}' "$@"\n`,
    { mode: 0o755 }
  );
  execFileSync('git', ['config', 'core.hooksPath', hooks], { cwd: repository });

  return () => readFileSync(record, 'utf8');
}

function run(
  repository: string,
  command: string,
  args: string[],
  path: string
): SpawnSyncReturns<string> {
  return spawnSync(command, args, {
    cwd: repository,
    encoding: 'utf8',
    env: { ...env, PATH: path },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function runHook(repository: string, args: string[], path: string): SpawnSyncReturns<string> {
  return run(repository, 'sh', ['-e', hook, ...args], path);
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('post-checkout hook', () => {
  // The null object ID is 40 zeros in a SHA-1 repository and 64 in a SHA-256 one.
  it.each(['sha1', 'sha256'] as const)(
    'stays silent when the previous HEAD is the %s null object ID',
    objectFormat => {
      const repository = createRepository(objectFormat);
      const newHEAD = head(repository);
      const pnpm = createPnpmStub();

      const result = runHook(repository, ['0'.repeat(newHEAD.length), newHEAD, '1'], pnpm.path);

      expect(result.status).toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
      expect(pnpm.calls()).toEqual([]);
    }
  );

  it('stays silent when git worktree add runs it', () => {
    const repository = createRepository();
    const hookArgs = installHook(repository);
    const worktree = resolve(createDirectory('fluent-measures-worktree-'), 'worktree');
    const pnpm = createPnpmStub();

    const result = run(
      repository,
      'git',
      ['worktree', 'add', '--quiet', '--detach', worktree, 'HEAD'],
      pnpm.path
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(hookArgs()).toBe(`${'0'.repeat(40)} ${head(repository)} 1\n`);
    expect(pnpm.calls()).toEqual([]);
  });

  it('runs pnpm install when a branch switch changes package.json', () => {
    const repository = createRepository();
    const prevHEAD = head(repository);
    const newHEAD = commit(repository, 'package.json', '{ "version": "2.0.0" }\n');
    const pnpm = createPnpmStub();

    const result = runHook(repository, [prevHEAD, newHEAD, '1'], pnpm.path);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(pnpm.calls()).toEqual(['install']);
  });
});
