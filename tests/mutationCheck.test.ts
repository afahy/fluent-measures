import { Buffer } from 'node:buffer';
import { execFileSync, spawnSync, type SpawnSyncReturns } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
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

// A stand-in for Stryker. Like Stryker 10, it writes warnings to stryker.log only when the config
// sets fileLogLevel to "warn" or lower, and it warns about each `mutate` pattern in a node_modules
// folder. It writes a report with no mutants.
const STUB_CONFIG = `const fs = require('node:fs');
const config = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));`;
const STRYKER_STUB = `${STUB_CONFIG}
const logs = ['trace', 'debug', 'info', 'warn'].includes(config.fileLogLevel);
for (const pattern of logs ? config.mutate : []) {
  if (/(^|\\/)node_modules\\//i.test(pattern)) {
    fs.appendFileSync('stryker.log', 'WARN ProjectReader Glob pattern "' + pattern + '" did not result in any files.\\n');
  }
}
fs.writeFileSync(config.jsonReporter.fileName, JSON.stringify({ files: {} }));
`;

// A stand-in for Stryker when no test imports the changed files. Like Stryker 10, it logs how many
// mutants it made when fileLogLevel is "info" or lower, then stops with "No tests were executed".
const strykerWithNoTests = (
  mutants: number,
  error = 'No tests were executed. Stryker will exit prematurely.'
): string => `${STUB_CONFIG}
if (['trace', 'debug', 'info'].includes(config.fileLogLevel)) {
  fs.appendFileSync('stryker.log', '12:00:00 (1) INFO Instrumenter Instrumented 1 source file(s) with ${mutants} mutant(s)\\n');
  fs.appendFileSync('stryker.log', '12:00:01 (1) ERROR Stryker ${error}\\n');
}
process.exit(1);
`;

/** Puts a Stryker stand-in where the check runs Stryker from. Git doesn't track it. */
function addStrykerStub(repository: string, stub = STRYKER_STUB): void {
  const bin = resolve(repository, 'node_modules/@stryker-mutator/core/bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(resolve(bin, 'stryker.js'), stub);
}

/** Writes the files, commits them, and returns the commit's hash. */
function commitFiles(repository: string, files: Record<string, string>): string {
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(resolve(repository, file)), { recursive: true });
    writeFileSync(resolve(repository, file), content);
  }
  // --force, so a global gitignore that lists node_modules doesn't leave fixture files out.
  git(repository, 'add', '--all', '--force');
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

  // AFA-82: Node opens a file by a UTF-8 name, so the check can't read these. The test makes the
  // commit with git plumbing, because some file systems, such as APFS, reject such a name. The
  // second name has line breaks, which must not start a line of their own in the output.
  it.each([
    ['src/caf', '.ts', 'src/caf\uFFFD.ts'],
    ['src/caf', '\n::warning::x\n.ts', 'src/caf\uFFFD\n::warning::x\n.ts'],
  ])('fails for a changed file whose name is %s + 0xE9 + %j', (start, end, shown) => {
    const repository = createRepository();
    const base = commitFiles(repository, { 'stryker.config.json': '{}\n' });
    const env = withoutGitRepository();
    const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], {
      cwd: repository,
      input: 'export const a = 1;\n',
      encoding: 'utf8',
      env,
    }).trim();
    // The byte 0xE9 is é in Latin-1 and isn't valid UTF-8 on its own.
    const entry = Buffer.concat([
      Buffer.from(`100644 ${blob}\t${start}`),
      Buffer.from([0xe9]),
      Buffer.from(`${end}\0`),
    ]);
    execFileSync('git', ['update-index', '-z', '--index-info'], {
      cwd: repository,
      input: entry,
      env,
    });
    git(repository, 'commit', '-m', 'test: add a file');

    const check = runCheck(repository, base);

    expect(check.status).toBe(1);
    expect(check.stderr).toContain(
      `::error::Rename ${JSON.stringify(shown)}. Its name isn't valid UTF-8`
    );
    expect(check.stderr).not.toMatch(/^::warning::/m);
    expect(check.stderr).not.toContain('Stryker exited');
  });

  // AFA-82 review: a line break or an escape in a name would break the check's output and its
  // reading of Stryker's log.
  it.each(['src/a\nb.ts', 'src/a\u001b[31mb.ts'])('fails for the changed path %j', file => {
    const repository = createRepository();
    const base = commitFiles(repository, { 'stryker.config.json': '{}\n' });
    commitFiles(repository, { [file]: 'export const a = 1;\n' });

    const check = runCheck(repository, base);

    expect(check.status).toBe(1);
    expect(check.stderr).toContain(
      `::error::Rename ${JSON.stringify(file)}. Its path has a control`
    );
    expect(check.stdout).not.toContain('Changed lines');
    expect(check.stderr).not.toContain('Stryker exited');
  });

  // AFA-82 review: --text doesn't turn off a textconv filter, which can drop changed lines.
  it('reads the changed lines of a file that a textconv filter changes', () => {
    const repository = createRepository();
    const base = commitFiles(repository, {
      'stryker.config.json': '{}\n',
      '.gitattributes': 'src/*.ts diff=strip\n',
      'src/units.ts': 'export const a = 1;\n',
    });
    commitFiles(repository, { 'src/units.ts': 'export const a = 2; // X\n' });

    const check = runCheck(repository, base, {
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'diff.strip.textconv',
      GIT_CONFIG_VALUE_0: 'grep -v X',
    });

    expect(check.stdout).toContain('Changed lines:\n  src/units.ts:1\n');
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

  // A file with only types has no mutants, but Stryker still finds it, so the check doesn't flag
  // it as a file that Stryker never reads.
  it("doesn't flag a changed file that Stryker finds but that has no mutants", () => {
    const repository = createRepository();
    const base = commitFiles(repository, { 'stryker.config.json': '{}\n' });
    commitFiles(repository, { 'src/types.ts': 'export type Unit = string;\n' });
    addStrykerStub(repository);

    const check = runCheck(repository, base);

    expect(check.stderr).toBe('');
    expect(check.stdout).toContain('Tests kill every mutant on the changed lines.');
    expect(check.status).toBe(0);
  });

  // AFA-113: a changed test file under src/ isn't one that Stryker mutates, so the check says so,
  // not that no lines changed.
  it('says that no changed file is one that Stryker mutates', () => {
    const repository = createRepository();
    const base = commitFiles(repository, {
      'stryker.config.json': '{ "mutate": ["src/**/!(*.spec|*.test).ts"] }\n',
    });
    commitFiles(repository, { 'src/units.test.ts': 'export const x = 1;\n' });

    const check = runCheck(repository, base);

    expect(check.stdout).toContain(
      'None of the changed files under src/ is one that Stryker mutates'
    );
    expect(check.status).toBe(0);
  });

  // AFA-83: no test imports a file with only types at runtime, so Stryker stops with "No tests
  // were executed". When the changed files have no mutants, there is nothing to check.
  it('passes when no test imports the changed files and they have no mutants', () => {
    const repository = createRepository();
    const base = commitFiles(repository, { 'stryker.config.json': '{}\n' });
    commitFiles(repository, { 'src/types.ts': 'export type Unit = string;\n' });
    addStrykerStub(repository, strykerWithNoTests(0));

    const check = runCheck(repository, base);

    expect(check.stderr).toBe('');
    expect(check.stdout).toContain(
      'The changed files have no mutants, so there is nothing to check.'
    );
    expect(check.status).toBe(0);
  });

  // A changed file with mutants that no test imports still fails, as on main.
  it('fails when no test imports the changed files and they have mutants', () => {
    const repository = createRepository();
    const base = commitFiles(repository, { 'stryker.config.json': '{}\n' });
    commitFiles(repository, { 'src/orphan.ts': 'export const addOne = (a: number) => a + 1;\n' });
    addStrykerStub(repository, strykerWithNoTests(2));

    const check = runCheck(repository, base);

    expect(check.status).toBe(1);
    expect(check.stderr).toContain('::error::Stryker exited with status 1.');
    expect(check.stdout).not.toContain('nothing to check');
  });

  // The check still finds a directive without a reason in a changed file with no mutants.
  it('fails for a directive without a reason when the changed files have no mutants', () => {
    const repository = createRepository();
    const base = commitFiles(repository, { 'stryker.config.json': '{}\n' });
    commitFiles(repository, {
      'src/types.ts': '// Stryker disable next-line all\nexport type Unit = string;\n',
    });
    addStrykerStub(repository, strykerWithNoTests(0));

    const check = runCheck(repository, base);

    expect(check.status).toBe(1);
    expect(check.stdout).not.toContain('nothing to check');
    expect(check.stderr).toContain(
      '::error file=src/types.ts,line=1::This Stryker disable comment has no reason.'
    );
    expect(check.stderr).not.toContain('Stryker exited with status');
  });

  // Only "No tests were executed" means that no test imports the files. Another error still fails.
  it('fails when Stryker stops for another reason, even with no mutants', () => {
    const repository = createRepository();
    const base = commitFiles(repository, { 'stryker.config.json': '{}\n' });
    commitFiles(repository, { 'src/types.ts': 'export type Unit = string;\n' });
    addStrykerStub(
      repository,
      strykerWithNoTests(0, 'There were failed tests in the initial test run.')
    );

    const check = runCheck(repository, base);

    expect(check.status).toBe(1);
    expect(check.stderr).toContain('::error::Stryker exited with status 1.');
  });

  // AFA-82 review: the check reads only this run's warnings, and keeps a log that it didn't make.
  it('ignores the warnings in an older stryker.log, and keeps that file', () => {
    const repository = createRepository();
    const base = commitFiles(repository, { 'stryker.config.json': '{}\n' });
    commitFiles(repository, { 'src/units.ts': 'export const a = 1;\n' });
    addStrykerStub(repository);
    const old = 'WARN ProjectReader Glob pattern "src/units.ts" did not result in any files.\n';
    writeFileSync(resolve(repository, 'stryker.log'), old);

    const check = runCheck(repository, base);

    expect(check.stdout).toContain('Tests kill every mutant on the changed lines.');
    expect(check.status).toBe(0);
    expect(readFileSync(resolve(repository, 'stryker.log'), 'utf8')).toBe(old);
  });

  // AFA-82 review: Stryker's warnings through a link to /dev/null are lost.
  it('fails when stryker.log is not a regular file', () => {
    const repository = createRepository();
    const base = commitFiles(repository, { 'stryker.config.json': '{}\n' });
    commitFiles(repository, { 'src/node_modules/x.ts': 'export const x = 1;\n' });
    addStrykerStub(repository);
    symlinkSync('/dev/null', resolve(repository, 'stryker.log'));

    const check = runCheck(repository, base);

    expect(check.status).toBe(1);
    expect(check.stderr).toContain('::error::Remove stryker.log, or make it a regular file.');
  });

  // The check depends on three things in the installed Stryker: the warning's text, the log's name
  // and that Stryker adds to the log. If an update changes one, this test fails.
  it('matches the warning, the log file, its write mode and its option in the installed Stryker', () => {
    const core = resolve('node_modules/@stryker-mutator/core/dist/src');
    expect(readFileSync(resolve(core, 'fs/project-reader.js'), 'utf8')).toContain(
      'this.log.warn(`Glob pattern "${pattern}" did not result in any files.`);'
    );
    const backend = readFileSync(resolve(core, 'logging/logging-backend.js'), 'utf8');
    expect(backend).toContain("const LOG_FILE_NAME = 'stryker.log';");
    expect(backend).toContain("fs.createWriteStream(LOG_FILE_NAME, { flags: 'a' })");
    // The file log is off unless the config's fileLogLevel turns it on.
    expect(backend).toContain('activeFileLevel = "off"');
    expect(backend).toContain('this.activeFileLevel = fileLogLevel;');
  });

  // AFA-83: the check reads two lines that Stryker logs: the mutant count, at "info" level, and the
  // error when no test runs. If an update changes either text, this test fails.
  it('matches the mutant count and the no-tests error in the installed Stryker', () => {
    const core = realpathSync('node_modules/@stryker-mutator/core');
    expect(
      readFileSync(resolve(core, '../instrumenter/dist/src/instrumenter.js'), 'utf8')
    ).toContain("this.logger.info('Instrumented %d source file(s) with %d mutant(s)'");
    expect(readFileSync(resolve(core, 'dist/src/process/3-dry-run-executor.js'), 'utf8')).toContain(
      "throw new ConfigError('No tests were executed."
    );
  });
});
