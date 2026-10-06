import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { git, withoutGitRepository } from './gitEnvironment';

const hook = resolve('.husky/prepare-commit-msg');
const repositories: string[] = [];
const env = withoutGitRepository();

function createRepository(branch: string): string {
  const repository = mkdtempSync(resolve(tmpdir(), 'fluent-measures-hook-'));
  repositories.push(repository);

  git(repository, 'init', '--initial-branch', 'main');
  git(repository, 'config', 'user.email', 'test@example.com');
  git(repository, 'config', 'user.name', 'Test');
  // Don't sign fixture commits with the developer's key, which may prompt for a passphrase.
  git(repository, 'config', 'commit.gpgsign', 'false');
  writeFileSync(resolve(repository, 'example.txt'), 'initial content\n');
  git(repository, 'add', 'example.txt');
  git(repository, 'commit', '-m', 'test: initial commit');

  if (branch !== 'main') {
    git(repository, 'checkout', '-b', branch);
  }

  writeFileSync(resolve(repository, 'example.txt'), 'staged change\n');
  git(repository, 'add', 'example.txt');

  return repository;
}

afterEach(() => {
  for (const repository of repositories.splice(0)) {
    rmSync(repository, { force: true, recursive: true });
  }
});

describe('prepare-commit-msg hook', () => {
  it('warns without blocking a non-interactive commit on a feature branch', () => {
    const result = spawnSync('sh', [hook], {
      cwd: createRepository('feature/test'),
      encoding: 'utf8',
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Warning: No changeset file detected.');
    expect(result.stderr).toBe('');
  });

  it('remains silent on main', () => {
    const result = spawnSync('sh', [hook], {
      cwd: createRepository('main'),
      encoding: 'utf8',
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });

  it('remains silent when hooks are skipped', () => {
    const result = spawnSync('sh', [hook], {
      cwd: createRepository('feature/test'),
      encoding: 'utf8',
      env: { ...env, HUSKY_SKIP_HOOKS: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });
});
