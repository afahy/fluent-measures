import { execFileSync, spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, resolve, sep } from 'node:path';
import { env } from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as Record<
  string,
  unknown
> & { scripts: Record<string, string> };
const repositories: string[] = [];

function createRepository({ withDependencies }: { withDependencies: boolean }): string {
  const repository = mkdtempSync(resolve(tmpdir(), 'fluent-measures-lifecycle-'));
  repositories.push(repository);

  execFileSync('git', ['init', '--initial-branch', 'main'], { cwd: repository });
  copyFileSync(resolve('package.json'), resolve(repository, 'package.json'));
  if (withDependencies) {
    symlinkSync(resolve('node_modules'), resolve(repository, 'node_modules'), 'dir');
  }

  return repository;
}

function runPrepare(repository: string, prepareEnv: typeof env): SpawnSyncReturns<string> {
  delete prepareEnv.HUSKY;

  return spawnSync('pnpm', ['run', 'prepare'], {
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
  for (const repository of repositories.splice(0)) {
    rmSync(repository, { force: true, recursive: true });
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

    const result = runPrepare(repository, { ...env });

    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(hooksPath(repository)).toBe('.husky/_');
  });

  // `pnpm install --prod` runs prepare without devDependencies, so husky is not installed.
  it('skips the Husky install when husky is not installed', { timeout: 20_000 }, () => {
    const repository = createRepository({ withDependencies: false });
    // `pnpm test` puts this repository's node_modules/.bin on PATH; drop it so husky is missing.
    const path = env.PATH?.split(delimiter)
      .filter(directory => !directory.startsWith(resolve() + sep))
      .join(delimiter);

    const result = runPrepare(repository, { ...env, PATH: path });

    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(hooksPath(repository)).toBe('');
  });
});
