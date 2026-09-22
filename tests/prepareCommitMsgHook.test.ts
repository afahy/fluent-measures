import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { env } from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';

const hook = resolve('.husky/prepare-commit-msg');
const repositories: string[] = [];

function createRepository(branch: string): string {
  const repository = mkdtempSync(resolve(tmpdir(), 'fluent-measures-hook-'));
  repositories.push(repository);

  execFileSync('git', ['init', '--initial-branch', 'main'], { cwd: repository });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repository });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repository });
  writeFileSync(resolve(repository, 'example.txt'), 'initial content\n');
  execFileSync('git', ['add', 'example.txt'], { cwd: repository });
  execFileSync('git', ['commit', '-m', 'test: initial commit'], { cwd: repository });

  if (branch !== 'main') {
    execFileSync('git', ['checkout', '-b', branch], { cwd: repository });
  }

  writeFileSync(resolve(repository, 'example.txt'), 'staged change\n');
  execFileSync('git', ['add', 'example.txt'], { cwd: repository });

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
