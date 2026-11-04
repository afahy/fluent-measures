import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { git, withoutGitRepository } from './gitEnvironment';

// The git hooks find pnpm through .husky/_pnpm.sh and .husky/bin/pnpm when pnpm isn't on PATH
// (AFA-187). Each test copies .husky into a repository whose package.json pins this version.
const VERSION = '9.15.4';
const PACKAGE_MANAGER = `pnpm@${VERSION}+sha512.0123abcd`;
const directories: string[] = [];
const env = withoutGitRepository();

// PATH without the folders that hold a real pnpm, corepack or npx, so that only the stubs run.
const systemPath = (env.PATH ?? '')
  .split(delimiter)
  .filter(dir => !['pnpm', 'corepack', 'npx'].some(name => existsSync(join(dir, name))))
  .join(delimiter);

function createDirectory(prefix: string): string {
  const directory = mkdtempSync(resolve(tmpdir(), prefix));
  directories.push(directory);
  return directory;
}

function commitPackageJson(root: string, version: string): string {
  writeFileSync(
    resolve(root, 'package.json'),
    `{\n  "version": "${version}",\n  "packageManager": "${PACKAGE_MANAGER}"\n}\n`
  );
  git(root, 'add', 'package.json');
  git(root, 'commit', '--quiet', '-m', `test: version ${version}`);
  return git(root, 'rev-parse', 'HEAD').trim();
}

// A repository with two commits that change package.json, and a copy of the hooks. Husky's
// generated .husky/_ folder isn't copied.
function createRepository(): { root: string; first: string; second: string } {
  const root = createDirectory('fluent-measures-hook-pnpm-');
  git(root, 'init', '--quiet', '--initial-branch', 'main');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');
  // Don't sign fixture commits with the developer's key, which may prompt for a passphrase.
  git(root, 'config', 'commit.gpgsign', 'false');
  const first = commitPackageJson(root, '1.0.0');
  const second = commitPackageJson(root, '2.0.0');
  git(root, 'update-ref', 'ORIG_HEAD', first);
  cpSync(resolve('.husky'), resolve(root, '.husky'), {
    recursive: true,
    filter: source => source !== resolve('.husky/_'),
  });
  return { root, first, second };
}

type Stubs = Partial<Record<'pnpm' | 'corepack' | 'npx', string>>;

// Writes each stub to a new folder. Each stub logs its name and arguments, then runs its body.
// Returns the PATH to run a hook with and a function that reads the log.
function createStubs(stubs: Stubs): { path: string; calls: () => string[] } {
  const bin = createDirectory('fluent-measures-stubs-');
  const log = resolve(bin, 'calls.log');
  for (const [name, body] of Object.entries(stubs)) {
    writeFileSync(resolve(bin, name), `#!/bin/sh\necho "${name} $*" >> '${log}'\n${body}\n`, {
      mode: 0o755,
    });
  }
  return {
    path: `${bin}${delimiter}${systemPath}`,
    calls: () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []),
  };
}

// Runs a hook the way Husky does, with `sh -e` from the repository root.
function runHook(
  root: string,
  hook: string,
  args: string[],
  path: string
): SpawnSyncReturns<string> {
  return spawnSync('sh', ['-e', resolve(root, '.husky', hook), ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...env, PATH: path },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('pnpm in the git hooks', () => {
  it('runs pnpm from PATH and leaves PATH alone when pnpm is on PATH', () => {
    const { root } = createRepository();
    const seen = resolve(createDirectory('fluent-measures-seen-'), 'path');
    const stubs = createStubs({ pnpm: `echo "$PATH" > '${seen}'`, corepack: 'exit 0' });

    const result = runHook(root, 'pre-commit', [], stubs.path);

    expect(result.status).toBe(0);
    expect(stubs.calls()).toEqual(['pnpm exec lint-staged']);
    expect(readFileSync(seen, 'utf8')).toBe(`${stubs.path}\n`);
  });

  // Each hook that runs pnpm, with the arguments git passes to it and the pnpm commands it runs.
  it.each([
    ['pre-commit', () => [], ['exec lint-staged']],
    ['commit-msg', () => ['.git/COMMIT_EDITMSG'], ['exec commitlint --edit .git/COMMIT_EDITMSG']],
    ['pre-push', () => [], ['test', 'build', 'check:size']],
    ['post-merge', () => [], ['install']],
    ['post-checkout', (first: string, second: string) => [first, second, '1'], ['install']],
  ] as const)('runs corepack pnpm in %s when pnpm is not on PATH', (hook, args, commands) => {
    const { root, first, second } = createRepository();
    const stubs = createStubs({ corepack: 'exit 0' });

    const result = runHook(root, hook, args(first, second), stubs.path);

    expect(result.status).toBe(0);
    expect(stubs.calls()).toEqual(
      commands.flatMap(command => ['corepack pnpm --version', `corepack pnpm ${command}`])
    );
  });

  it('puts its pnpm on PATH for the commands that a hook starts', () => {
    const { root } = createRepository();
    const seen = resolve(createDirectory('fluent-measures-seen-'), 'pnpm');
    const stubs = createStubs({
      corepack: `[ "$2" = --version ] || echo "$(command -v pnpm) $COREPACK_ENABLE_DOWNLOAD_PROMPT" > '${seen}'`,
    });

    const result = runHook(root, 'pre-commit', [], stubs.path);

    expect(result.status).toBe(0);
    expect(readFileSync(seen, 'utf8')).toBe(`${resolve(root, '.husky/bin/pnpm')} 0\n`);
  });

  it('falls back to npx with the packageManager version when corepack does not work', () => {
    const { root } = createRepository();
    const stubs = createStubs({ corepack: 'exit 1', npx: 'exit 0' });

    const result = runHook(root, 'pre-commit', [], stubs.path);

    expect(result.status).toBe(0);
    expect(stubs.calls()).toEqual([
      'corepack pnpm --version',
      `npx --yes pnpm@${VERSION} --version`,
      `npx --yes pnpm@${VERSION} exec lint-staged`,
    ]);
  });

  it('falls back to npx when corepack is not installed', () => {
    const { root } = createRepository();
    const stubs = createStubs({ npx: 'exit 0' });

    const result = runHook(root, 'pre-commit', [], stubs.path);

    expect(result.status).toBe(0);
    expect(stubs.calls()).toEqual([
      `npx --yes pnpm@${VERSION} --version`,
      `npx --yes pnpm@${VERSION} exec lint-staged`,
    ]);
  });

  it('fails with an error that names the version when neither corepack nor npx works', () => {
    const { root } = createRepository();
    const stubs = createStubs({ corepack: 'exit 1', npx: 'exit 1' });

    const result = runHook(root, 'pre-commit', [], stubs.path);

    expect(result.status).toBe(127);
    expect(result.stderr).toBe(
      `husky - pnpm isn't on PATH, and neither 'corepack pnpm' nor 'npx pnpm@${VERSION}' works.\n` +
        `husky - Install pnpm ${VERSION} and put it on PATH: https://pnpm.io/installation\n`
    );
    expect(stubs.calls()).toEqual([
      'corepack pnpm --version',
      `npx --yes pnpm@${VERSION} --version`,
    ]);
  });

  it('fails with the error when neither corepack nor npx is installed', () => {
    const { root } = createRepository();
    const stubs = createStubs({});

    const result = runHook(root, 'pre-commit', [], stubs.path);

    expect(result.status).toBe(127);
    expect(result.stderr).toContain("husky - pnpm isn't on PATH");
  });

  it('fails when the command that it runs through corepack fails', () => {
    const { root } = createRepository();
    const stubs = createStubs({ corepack: '[ "$2" = --version ] || exit 3' });

    const commit = runHook(root, 'pre-commit', [], stubs.path);
    const push = runHook(root, 'pre-push', [], stubs.path);

    expect(commit.status).toBe(3);
    // pre-push stops at the first command that fails, with `|| exit 1`.
    expect(push.status).toBe(1);
    expect(stubs.calls()).toEqual([
      'corepack pnpm --version',
      'corepack pnpm exec lint-staged',
      'corepack pnpm --version',
      'corepack pnpm test',
    ]);
  });

  it('fails when the command that it runs through npx fails', () => {
    const { root } = createRepository();
    const stubs = createStubs({ npx: '[ "$3" = --version ] || exit 4' });

    const result = runHook(root, 'pre-commit', [], stubs.path);

    expect(result.status).toBe(4);
  });
});
