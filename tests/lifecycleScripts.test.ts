import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { env } from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as Record<
  string,
  unknown
> & { scripts: Record<string, string> };
const repositories: string[] = [];

function createRepository(): string {
  const repository = mkdtempSync(resolve(tmpdir(), 'fluent-measures-lifecycle-'));
  repositories.push(repository);

  execFileSync('git', ['init', '--initial-branch', 'main'], { cwd: repository });
  copyFileSync(resolve('package.json'), resolve(repository, 'package.json'));
  symlinkSync(resolve('node_modules'), resolve(repository, 'node_modules'), 'dir');

  return repository;
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
    const repository = createRepository();
    const prepareEnv = { ...env };
    delete prepareEnv.HUSKY;

    const result = spawnSync('pnpm', ['run', 'prepare'], {
      cwd: repository,
      encoding: 'utf8',
      env: prepareEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(
      execFileSync('git', ['config', 'core.hooksPath'], {
        cwd: repository,
        encoding: 'utf8',
      }).trim()
    ).toBe('.husky/_');
  });
});
