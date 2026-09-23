import { execFileSync, spawnSync, type SpawnSyncReturns } from 'node:child_process';
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, resolve } from 'node:path';
import { env } from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as Record<
  string,
  unknown
> & { scripts: Record<string, string> };
const directories: string[] = [];

function createDirectory(prefix: string): string {
  const directory = mkdtempSync(resolve(tmpdir(), prefix));
  directories.push(directory);
  return directory;
}

function createRepository({ withDependencies }: { withDependencies: boolean }): string {
  const repository = createDirectory('fluent-measures-lifecycle-');

  execFileSync('git', ['init', '--initial-branch', 'main'], { cwd: repository });
  copyFileSync(resolve('package.json'), resolve(repository, 'package.json'));
  if (withDependencies) {
    symlinkSync(resolve('node_modules'), resolve(repository, 'node_modules'), 'dir');
  }

  return repository;
}

function runPrepare(
  repository: string,
  packageManager: 'npm' | 'pnpm',
  path = env.PATH
): SpawnSyncReturns<string> {
  const prepareEnv: typeof env = { ...env, PATH: path };
  delete prepareEnv.HUSKY;

  return spawnSync(packageManager, ['run', 'prepare'], {
    cwd: repository,
    encoding: 'utf8',
    env: prepareEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function hooksPath(repository: string): string {
  return spawnSync('git', ['config', 'core.hooksPath'], {
    cwd: repository,
    encoding: 'utf8',
  }).stdout.trim();
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('package lifecycle scripts', () => {
  // npm and pnpm only run lifecycle hooks listed under "scripts"; top-level keys are ignored.
  it.each(['prepare', 'prepack', 'prepublishOnly'])('declares %s under scripts', hook => {
    expect(packageJson.scripts).toHaveProperty(hook);
    expect(packageJson).not.toHaveProperty(hook);
  });

  it('installs the Husky git hooks when pnpm runs prepare', { timeout: 20_000 }, () => {
    const repository = createRepository({ withDependencies: true });

    const result = runPrepare(repository, 'pnpm');

    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(hooksPath(repository)).toBe('.husky/_');
  });

  // `pnpm install --prod` runs prepare without devDependencies, so husky is not installed.
  it('skips the Husky install when husky is not installed', { timeout: 20_000 }, () => {
    const repository = createRepository({ withDependencies: false });

    const result = runPrepare(repository, 'pnpm');

    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(hooksPath(repository)).toBe('');
  });

  // npm runs prepare when a consumer installs this package from Git, where pnpm may be missing.
  it('runs prepare with npm when pnpm is not available', { timeout: 20_000 }, () => {
    const repository = createRepository({ withDependencies: true });
    const bin = createDirectory('fluent-measures-no-pnpm-');
    writeFileSync(resolve(bin, 'pnpm'), '#!/bin/sh\nexit 127\n', { mode: 0o755 });

    const result = runPrepare(repository, 'npm', `${bin}${delimiter}${env.PATH}`);

    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(hooksPath(repository)).toBe('.husky/_');
  });
});
