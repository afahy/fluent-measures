import { Buffer } from 'node:buffer';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

/**
 * Runs the check on the repository. Its temporary folder goes in a folder that the test removes.
 * The repository has a Stryker config but no Stryker, so the check fails when it runs Stryker.
 */
function runCheck(
  repository: string,
  base: string,
  env: Record<string, string> = {}
): SpawnSyncReturns<string> {
  const temporary = mkdtempSync(resolve(tmpdir(), 'fluent-measures-mutation-tmp-'));
  directories.push(temporary);
  return spawnSync(execPath, [script, '--base', base], {
    cwd: repository,
    encoding: 'utf8',
    env: { ...withoutGitRepository(), TMPDIR: temporary, ...env },
  });
}

// A stand-in for Stryker. Like Stryker 10, it warns in stryker.log about each `mutate` pattern in
// a node_modules folder, and it writes a report with no mutants.
const STRYKER_STUB = `const fs = require('node:fs');
const config = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
for (const pattern of config.mutate) {
  if (/(^|\\/)node_modules\\//i.test(pattern)) {
    fs.appendFileSync('stryker.log', 'WARN ProjectReader Glob pattern "' + pattern + '" did not result in any files.\\n');
  }
}
fs.writeFileSync(config.jsonReporter.fileName, JSON.stringify({ files: {} }));
`;

/** Puts the Stryker stand-in where the check runs Stryker from. Git doesn't track it. */
function addStrykerStub(repository: string): void {
  const bin = resolve(repository, 'node_modules/@stryker-mutator/core/bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(resolve(bin, 'stryker.js'), STRYKER_STUB);
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
  // The check now stops before it runs Stryker.
  it('fails for each changed path with a backslash, and asks for a rename', () => {
    const repository = createRepository();
    const base = commitFiles(repository, {
      'stryker.config.json': '{}\n',
      'src/units.ts': 'export const a = 1;\n',
    });
    // In these strings, `\\` is one backslash.
    commitFiles(repository, {
      'src/units.ts': 'export const a = 2;\n',
      'src/a\\b.ts': 'export const b = 1;\n',
      'src/c\\d/e.ts': 'export const e = 1;\n',
    });

    const check = runCheck(repository, base);

    expect(check.status).toBe(1);
    expect(check.stderr).toContain('::error file=src/a\\b.ts::Rename src/a\\b.ts.');
    expect(check.stderr).toContain('::error file=src/c\\d/e.ts::Rename src/c\\d/e.ts.');
    expect(check.stderr).not.toContain('src/units.ts');
    expect(check.stderr).not.toContain('Stryker exited');
  });

  // Git reads a pathspec as a glob unless it's literal: `\b` matches `b`, and `[u]` matches `u`.
  it('gives each changed file only its own changed lines', () => {
    const repository = createRepository();
    const base = commitFiles(repository, {
      'stryker.config.json': '{}\n',
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

    const check = runCheck(repository, base);

    expect(check.stdout).toContain(
      'Changed lines:\n  src/[u]nits.ts:1\n  src/ab.ts:2\n  src/units.ts:2-3\n'
    );
    expect(check.stderr).not.toContain('Rename');
    // The check goes on past the backslash check to run Stryker.
    expect(check.stderr).toContain('::error::Stryker exited with status 1.');
  });

  // AFA-82: git shows a file with a NUL byte, or with a -diff attribute, as binary, with no lines.
  it.each([
    ['a NUL byte', {}, 'export const a = 2; // \0\n'],
    ['a -diff attribute', { '.gitattributes': 'src/*.ts -diff\n' }, 'export const a = 2;\n'],
  ])('reads the changed lines of a file with %s', (_, extra, after) => {
    const repository = createRepository();
    const base = commitFiles(repository, {
      'stryker.config.json': '{}\n',
      'src/units.ts': 'export const a = 1;\n',
      ...extra,
    });
    commitFiles(repository, { 'src/units.ts': after });

    expect(runCheck(repository, base).stdout).toContain('Changed lines:\n  src/units.ts:1\n');
  });

  // AFA-82: these variables change how git reads a pathspec or writes a diff.
  it.each([
    ['GIT_LITERAL_PATHSPECS', '1'],
    ['GIT_GLOB_PATHSPECS', '1'],
    ['GIT_DIFF_OPTS', '--unified=3'],
  ])('reads the same changed lines with %s=%s', (name, value) => {
    const repository = createRepository();
    const base = commitFiles(repository, {
      'stryker.config.json': '{}\n',
      'src/units.ts': 'export const a = 1;\nexport const b = 2;\nexport const c = 3;\n',
    });
    commitFiles(repository, {
      'src/units.ts': 'export const a = 1;\nexport const b = 4;\nexport const c = 3;\n',
    });

    expect(runCheck(repository, base, { [name]: value }).stdout).toContain(
      'Changed lines:\n  src/units.ts:2\n'
    );
  });

  // AFA-82: Node opens a file by a UTF-8 name, so the check can't read this one.
  it('fails for a changed file whose name is not valid UTF-8', () => {
    const repository = createRepository();
    const base = commitFiles(repository, { 'stryker.config.json': '{}\n' });
    mkdirSync(resolve(repository, 'src'));
    // "src/caf" + the byte 0xE9 (é in Latin-1) + ".ts"
    const name = Buffer.concat([
      Buffer.from(resolve(repository, 'src/caf')),
      Buffer.from([0xe9]),
      Buffer.from('.ts'),
    ]);
    writeFileSync(name, 'export const a = 1;\n');
    git(repository, 'add', '--all');
    git(repository, 'commit', '-m', 'test: add a file');

    const check = runCheck(repository, base);

    expect(check.status).toBe(1);
    expect(check.stderr).toContain("::error::Rename src/caf\uFFFD.ts. Its name isn't valid UTF-8");
    expect(check.stderr).not.toContain('Stryker exited');
  });

  // AFA-82: Stryker never reads a node_modules folder, so it doesn't mutate the file.
  it('fails for a changed file that Stryker never reads, and removes its log', () => {
    const repository = createRepository();
    const base = commitFiles(repository, { 'stryker.config.json': '{}\n' });
    commitFiles(repository, {
      'src/node_modules/x.ts': 'export const x = 1;\n',
      'src/units.ts': 'export const a = 1;\n',
    });
    addStrykerStub(repository);

    const check = runCheck(repository, base);

    expect(check.status).toBe(1);
    expect(check.stderr).toContain(
      '::error file=src/node_modules/x.ts::Move src/node_modules/x.ts. Stryker never reads'
    );
    expect(check.stderr).not.toContain('src/units.ts');
    expect(existsSync(resolve(repository, 'stryker.log'))).toBe(false);
  });

  // A file with only types has no mutants, but Stryker still finds it.
  it('passes for a changed file without mutants', () => {
    const repository = createRepository();
    const base = commitFiles(repository, { 'stryker.config.json': '{}\n' });
    commitFiles(repository, { 'src/types.ts': 'export type Unit = string;\n' });
    addStrykerStub(repository);

    const check = runCheck(repository, base);

    expect(check.stderr).toBe('');
    expect(check.stdout).toContain('Tests kill every mutant on the changed lines.');
    expect(check.status).toBe(0);
  });
});
