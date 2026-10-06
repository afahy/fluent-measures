import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { execPath } from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';
import { git, withoutGitRepository } from './gitEnvironment';

const script = resolve('.github/scripts/mutation-check.mjs');
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function createRepository(): string {
  const repository = mkdtempSync(resolve(tmpdir(), 'fluent-measures-mutation-'));
  directories.push(repository);
  git(repository, 'init', '--initial-branch', 'main');
  git(repository, 'config', 'user.email', 'test@example.com');
  git(repository, 'config', 'user.name', 'Test');
  // Don't sign fixture commits with the developer's key, which may prompt for a passphrase.
  git(repository, 'config', 'commit.gpgsign', 'false');
  return repository;
}

/** Writes the files, commits them, and returns the commit's hash. */
function commitFiles(repository: string, files: Record<string, string>): string {
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(resolve(repository, file)), { recursive: true });
    writeFileSync(resolve(repository, file), content);
  }
  git(repository, 'add', '--all');
  git(repository, 'commit', '-m', 'test: update files');
  return git(repository, 'rev-parse', 'HEAD').trim();
}

describe('mutation-check.mjs', () => {
  // AFA-71: Stryker reads a backslash as a slash, so the check passed without checking the file.
  // The check now stops before it runs Stryker, so this repository needs no Stryker config.
  it('fails for each changed path with a backslash, and asks for a rename', () => {
    const repository = createRepository();
    const base = commitFiles(repository, { 'src/units.ts': 'export const a = 1;\n' });
    // In these strings, `\\` is one backslash.
    commitFiles(repository, {
      'src/units.ts': 'export const a = 2;\n',
      'src/a\\b.ts': 'export const b = 1;\n',
      'src/c\\d/e.ts': 'export const e = 1;\n',
    });

    const check = spawnSync(execPath, [script, '--base', base], {
      cwd: repository,
      encoding: 'utf8',
      env: withoutGitRepository(),
    });

    expect(check.status).toBe(1);
    expect(check.stderr).toContain('::error file=src/a\\b.ts::Rename src/a\\b.ts.');
    expect(check.stderr).toContain('::error file=src/c\\d/e.ts::Rename src/c\\d/e.ts.');
    expect(check.stderr).not.toContain('src/units.ts');
  });

  // Git reads a pathspec as a glob unless it's literal: `\b` matches `b`, and `[u]` matches `u`.
  // The changed lines print before the script reads the Stryker config, which this repository
  // doesn't have, so the script stops after them.
  it('gives each changed file only its own changed lines', () => {
    const repository = createRepository();
    const base = commitFiles(repository, {
      'src/a\\b.ts': 'export const a = 1;\nexport const b = 2;\n',
      'src/ab.ts': 'export const c = 3;\n',
      'src/[u]nits.ts': 'export const d = 4;\n',
      'src/units.ts': 'export const e = 5;\n',
    });
    commitFiles(repository, {
      'src/a\\b.ts': 'export const a = 1;\n',
      'src/ab.ts': 'export const c = 3;\nexport const f = 6;\n',
      'src/[u]nits.ts': 'export const d = 7;\n',
      'src/units.ts': 'export const e = 5;\nexport const g = 8;\nexport const h = 9;\n',
    });

    const check = spawnSync(execPath, [script, '--base', base], {
      cwd: repository,
      encoding: 'utf8',
      env: withoutGitRepository(),
    });

    expect(check.stdout).toContain(
      'Changed lines:\n  src/[u]nits.ts:1\n  src/ab.ts:2\n  src/units.ts:2-3\n'
    );
    expect(check.stderr).not.toContain('Rename');
  });
});
