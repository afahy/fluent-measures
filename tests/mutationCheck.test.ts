import { Buffer } from 'node:buffer';
import { execFileSync, spawnSync, type SpawnSyncReturns } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { execPath } from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';
import { git, withoutGitRepository } from './gitEnvironment';
import type { ReportMutant } from '../.github/scripts/changed-lines.mjs';

const script = resolve('.github/scripts/mutation-check.mjs');
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/** Creates a repository in a new temporary folder, or in a folder of that name inside it. */
function createRepository(folder?: string): string {
  const parent = mkdtempSync(resolve(tmpdir(), 'fluent-measures-mutation-'));
  directories.push(parent);
  const repository = folder === undefined ? parent : resolve(parent, folder);
  mkdirSync(repository, { recursive: true });
  git(repository, 'init', '--initial-branch', 'main');
  git(repository, 'config', 'user.email', 'test@example.com');
  git(repository, 'config', 'user.name', 'Test');
  // Don't sign fixture commits with the developer's key, which may prompt for a passphrase.
  git(repository, 'config', 'commit.gpgsign', 'false');
  writeFileSync(resolve(repository, 'stryker.config.json'), '{}\n');
  return repository;
}

/** Runs the report filter in a fixture repository, without installing or running Stryker. */
function runCheck(
  repository: string,
  base: string,
  env: Record<string, string> = {},
  args: string[] = []
): SpawnSyncReturns<string> {
  // Most tests isolate git and path handling. A synthetic empty report supplies the file
  // inventory for those cases; recorded real reports below cover mutant and zero-mutant results.
  const report = resolve(repository, 'mutation.json');
  if (!existsSync(resolve(repository, 'mutation.json')) && !args.includes('--prepare')) {
    const filesRead = Object.fromEntries(
      git(repository, 'ls-files', '-z')
        .split('\0')
        .filter(file => file && !file.split('/').includes('node_modules'))
        .map(file => [file, file.endsWith('.ts') && !/\.(?:test|spec)\.ts$/.test(file)])
    );
    writeFileSync(report, JSON.stringify({ files: {}, filesRead }));
  }
  return spawnSync(
    execPath,
    [
      script,
      '--base',
      base,
      ...(args.some(arg => ['--prepare', '--report'].includes(arg))
        ? []
        : ['--report', 'mutation.json']),
      ...args,
    ],
    {
      cwd: repository,
      encoding: 'utf8',
      env: { ...withoutGitRepository(), ...env },
    }
  );
}

function writeReport(repository: string, report: object): void {
  writeFileSync(resolve(repository, 'mutation.json'), JSON.stringify(report));
}

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
  // AFA-71: Stryker reads a backslash as a slash, so it wouldn't check the file. The check stops
  // before checking its report.
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
      // AFA-79: the `file=` property escapes a comma too.
      'src/f\\g,h.ts': 'export const h = 1;\n',
    });

    const check = runCheck(repository, base);

    expect(check.status).toBe(1);
    expect(check.stderr).toContain('::error file=src/a\\b.ts::Rename src/a\\b.ts.');
    expect(check.stderr).toContain('::error file=src/c\\d/e.ts::Rename src/c\\d/e.ts.');
    expect(check.stderr).toContain('::error file=src/f\\g%2Ch.ts::Rename src/f\\g,h.ts.');
    expect(check.stderr).not.toContain('src/units.ts');
    expect(check.stderr).not.toContain('Stryker exited');
  });

  // AFA-85: git diffs only the link's target path, but Stryker mutates the file that the link
  // points to, so the changed lines and the mutants' lines don't match. The check stops before it
  // checks its report.
  it('fails for a changed source file that is a symbolic link', () => {
    const repository = createRepository();
    const base = commitFiles(repository, {
      'stryker.config.json': '{}\n',
      'lib/impl.ts': 'export const a = 1;\n',
    });
    mkdirSync(resolve(repository, 'src'));
    symlinkSync('../lib/impl.ts', resolve(repository, 'src/units.ts'));
    commitFiles(repository, { 'lib/impl.ts': 'export const a = 1 > 0;\n' });

    const check = runCheck(repository, base);

    expect(check.status).toBe(1);
    expect(check.stderr).toContain('::error file=src/units.ts::Replace src/units.ts');
    expect(check.stdout).not.toContain('Tests kill every mutant');
  });

  // Stryker follows a link to a folder too, and a link of any name is one change to git.
  it.each([
    ['a folder', 'src/extra', '../lib'],
    ['a .mts file', 'src/units.mts', '../lib/impl.mts'],
  ])('fails for a changed symbolic link to %s', (_kind, link, target) => {
    const repository = createRepository();
    const base = commitFiles(repository, {
      'stryker.config.json': '{}\n',
      'lib/impl.ts': 'export const a = 1;\n',
      'lib/impl.mts': 'export const b = 1;\n',
    });
    mkdirSync(resolve(repository, 'src'));
    symlinkSync(target, resolve(repository, link));
    commitFiles(repository, { 'src/index.ts': 'export const c = 1 > 0;\n' });

    const check = runCheck(repository, base);

    expect(check.status).toBe(1);
    expect(check.stderr).toContain(`::error file=${link}::Replace ${link}`);
  });

  // A link to a file counts only where the file would: the config leaves out a test file, and
  // Stryker never mutates a file that isn't code.
  it.each([
    ['a test file', 'src/units.test.ts', '../lib/impl.ts'],
    ['a file that is not code', 'src/data.json', '../lib/data.json'],
  ])('passes a changed symbolic link to %s', (_kind, link, target) => {
    const repository = createRepository();
    const base = commitFiles(repository, {
      'stryker.config.json': '{ "mutate": ["src/**/!(*.spec|*.test).ts"] }\n',
      'lib/impl.ts': 'export const a = 1;\n',
      'lib/data.json': '{}\n',
    });
    mkdirSync(resolve(repository, 'src'));
    symlinkSync(target, resolve(repository, link));
    commitFiles(repository, { 'lib/impl.ts': 'export const a = 1 > 0;\n' });

    const check = runCheck(repository, base);

    expect(check.stdout).toContain(
      'No added or changed line under src/ is in a file that Stryker mutates'
    );
    expect(check.status).toBe(0);
  });

  // With core.symlinks=false, git checks a link out as a plain file that holds its target path.
  it('fails for a symbolic link that the checkout holds as a plain file', () => {
    const repository = createRepository();
    const base = commitFiles(repository, {
      'stryker.config.json': '{}\n',
      'lib/impl.ts': 'export const a = 1;\n',
    });
    mkdirSync(resolve(repository, 'src'));
    symlinkSync('../lib/impl.ts', resolve(repository, 'src/units.ts'));
    commitFiles(repository, { 'lib/impl.ts': 'export const a = 1 > 0;\n' });
    rmSync(resolve(repository, 'src/units.ts'));
    writeFileSync(resolve(repository, 'src/units.ts'), '../lib/impl.ts');

    const check = runCheck(repository, base);

    expect(check.status).toBe(1);
    expect(check.stderr).toContain('::error file=src/units.ts::Replace src/units.ts');
  });

  // AFA-85: the project mutates only `.ts` files, but tsc, Vitest and tsup also use these, so a
  // change to one would pass with no check.
  it.each([
    'src/units.mts',
    'src/units.cts',
    'src/units.js',
    'src/units.mjs',
    'src/units.cjs',
    'src/units.jsx',
    'src/units.tsx',
  ])('fails for a changed code file that Stryker never mutates: %s', file => {
    const repository = createRepository();
    const base = commitFiles(repository, { 'stryker.config.json': '{}\n' });
    commitFiles(repository, {
      [file]: 'export const a = 1 > 0;\n',
      'src/index.ts': "export { a } from './units';\n",
    });

    const check = runCheck(repository, base);

    expect(check.status).toBe(1);
    expect(check.stderr).toContain(`::error file=${file}::Use a .ts file in place of ${file}.`);
  });

  // The config leaves out a test file under src/, whatever its extension, as it does for `.ts`.
  it('says that a test file with another code extension is not a file that Stryker mutates', () => {
    const repository = createRepository();
    const base = commitFiles(repository, {
      'stryker.config.json': '{ "mutate": ["src/**/!(*.spec|*.test).ts"] }\n',
    });
    commitFiles(repository, { 'src/units.test.mts': 'export const x = 1;\n' });

    const check = runCheck(repository, base);

    expect(check.stdout).toContain(
      'No added or changed line under src/ is in a file that Stryker mutates'
    );
    expect(check.status).toBe(0);
  });

  // Only added or changed lines have mutants to check, as for a `.ts` file.
  it('passes a code file with another extension that only loses lines', () => {
    const repository = createRepository();
    const base = commitFiles(repository, {
      'stryker.config.json': '{}\n',
      'src/units.mts': 'export const a = 1;\nexport const b = 2;\n',
    });
    commitFiles(repository, { 'src/units.mts': 'export const a = 1;\n' });

    const check = runCheck(repository, base);

    expect(check.stdout).toContain(
      'No added or changed line under src/ is in a file that Stryker mutates'
    );
    expect(check.status).toBe(0);
  });

  // A declaration file has no code to mutate, whatever its extension.
  it.each(['src/types.d.mts', 'src/types.d.cts'])(
    'says that %s is not a file that Stryker mutates',
    file => {
      const repository = createRepository();
      const base = commitFiles(repository, { 'stryker.config.json': '{}\n' });
      commitFiles(repository, { [file]: 'export type Unit = string;\n' });

      const check = runCheck(repository, base);

      expect(check.stdout).toContain(
        'No added or changed line under src/ is in a file that Stryker mutates'
      );
      expect(check.status).toBe(0);
    }
  );

  // These extensions aren't code that tsc, Vitest or tsup reads, so they stay as on `main`.
  it.each(['src/template.mtsx', 'src/template.ctsx', 'src/template.mjsx', 'src/template.cjsx'])(
    'says that %s is not a file that Stryker mutates',
    file => {
      const repository = createRepository();
      const base = commitFiles(repository, { 'stryker.config.json': '{}\n' });
      commitFiles(repository, { [file]: 'export const a = 1 > 0;\n' });

      const check = runCheck(repository, base);

      expect(check.stdout).toContain(
        'No added or changed line under src/ is in a file that Stryker mutates'
      );
      expect(check.status).toBe(0);
    }
  );

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
    expect(check.status).toBe(0);
    expect(check.stdout).toContain('Tests kill every mutant on the changed lines.');
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
  // printed paths.
  it.each(['src/a\nb.ts', 'src/a\u001b[31mb.ts', 'src/a,b\n%0Ac.ts'])(
    'fails for the changed path %j',
    file => {
      const repository = createRepository();
      const base = commitFiles(repository, { 'stryker.config.json': '{}\n' });
      commitFiles(repository, { [file]: 'export const a = 1;\n' });

      const check = runCheck(repository, base);

      expect(check.status).toBe(1);
      // AFA-79: the message escapes "%", so GitHub can't read "%0A" in a name as a line break.
      expect(check.stderr).toContain(
        `::error::Rename ${JSON.stringify(file).replace(/%/g, '%25')}. Its path has a control`
      );
      expect(check.stdout).not.toContain('Changed lines');
      expect(check.stderr).not.toContain('Stryker exited');
    }
  );

  // AFA-79: a comma ended the `file=` property early, so the annotation pointed to `src/a`. A colon
  // and a "%" need escapes in a property too.
  it('escapes a changed path with a comma, a colon and a "%" in its annotation', () => {
    const repository = createRepository();
    const base = commitFiles(repository, { 'stryker.config.json': '{}\n' });
    commitFiles(repository, {
      'src/a,b:%c.ts': '// Stryker disable next-line all\nexport type Unit = string;\n',
    });

    const check = runCheck(repository, base);

    expect(check.status).toBe(1);
    expect(check.stderr).toContain(
      '::error file=src/a%2Cb%3A%25c.ts,line=1::This Stryker disable comment has no reason.'
    );
  });

  // AFA-79 final review: the annotations of an unkilled mutant and of a mutant that a directive
  // ignores without a reason escape the path too.
  it('escapes the path in the annotation of each unkilled or ignored mutant', () => {
    const repository = createRepository();
    const base = commitFiles(repository, { 'stryker.config.json': '{}\n' });
    commitFiles(repository, { 'src/a,b.ts': 'export const a = true;\n' });
    const location = { start: { line: 1, column: 17 }, end: { line: 1, column: 21 } };
    writeReport(repository, {
      filesRead: { 'src/a,b.ts': true },
      files: {
        'src/a,b.ts': {
          mutants: [
            { mutatorName: 'BooleanLiteral', replacement: 'false', status: 'Survived', location },
            {
              mutatorName: 'EqualityOperator',
              status: 'Ignored',
              statusReason: 'Ignored using a comment',
              location,
            },
          ],
        },
      },
    });

    const check = runCheck(repository, base);

    expect(check.status).toBe(1);
    expect(check.stderr).toContain(
      `::error file=src/a%2Cb.ts,line=1,col=17::The BooleanLiteral mutant "false" on a changed line isn't killed: it survived.`
    );
    expect(check.stderr).toContain(
      '::error file=src/a%2Cb.ts,line=1,col=17::A Stryker disable comment ignores the EqualityOperator mutant without a reason.'
    );
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
  it('fails for a changed file that the report says Stryker never read', () => {
    const repository = createRepository();
    const base = commitFiles(repository, { 'stryker.config.json': '{}\n' });
    commitFiles(repository, {
      'src/node_modules/x.ts': 'export const x = 1;\n',
      // AFA-79: the `file=` property escapes a comma too.
      'src/node_modules/y,z.ts': 'export const y = 1;\n',
      'src/units.ts': 'export const a = 1;\n',
    });

    const check = runCheck(repository, base);

    expect(check.status).toBe(1);
    expect(check.stderr).toContain(
      '::error file=src/node_modules/x.ts::Move src/node_modules/x.ts or include it'
    );
    expect(check.stderr).toContain(
      '::error file=src/node_modules/y%2Cz.ts::Move src/node_modules/y,z.ts or include it'
    );
    expect(check.stderr).not.toContain('src/units.ts');
  });

  // A file with only types has no mutants, but Stryker still finds it, so the check doesn't flag
  // it as a file that Stryker never reads.
  it("doesn't flag a changed file that Stryker finds but that has no mutants", () => {
    const repository = createRepository();
    const base = commitFiles(repository, { 'stryker.config.json': '{}\n' });
    commitFiles(repository, { 'src/types.ts': 'export type Unit = string;\n' });

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
      'No added or changed line under src/ is in a file that Stryker mutates'
    );
    expect(check.status).toBe(0);
  });

  it.each(['src/types.d.ts', 'src/data.json'])(
    'says that %s is not a file that Stryker mutates',
    file => {
      const repository = createRepository();
      const base = commitFiles(repository, { 'stryker.config.json': '{}\n' });
      commitFiles(repository, { [file]: 'export type Unit = string;\n' });

      const check = runCheck(repository, base);

      expect(check.stdout).toContain(
        'No added or changed line under src/ is in a file that Stryker mutates'
      );
      expect(check.status).toBe(0);
    }
  );

  // A changed file that only loses lines has no added or changed line to check either.
  it('says that no added or changed line is in a file that Stryker mutates', () => {
    const repository = createRepository();
    const base = commitFiles(repository, {
      'stryker.config.json': '{ "mutate": ["src/**/!(*.spec|*.test).ts"] }\n',
      'src/b.ts': 'export const a = 1;\nexport const b = 2;\n',
    });
    commitFiles(repository, {
      'src/b.ts': 'export const a = 1;\n',
      'src/units.test.ts': 'export const x = 1;\n',
    });

    const check = runCheck(repository, base);

    expect(check.stdout).toContain(
      'No added or changed line under src/ is in a file that Stryker mutates'
    );
    expect(check.status).toBe(0);
  });

  it('fails for a directive without a reason when the changed files have no mutants', () => {
    const repository = createRepository();
    const base = commitFiles(repository, { 'stryker.config.json': '{}\n' });
    commitFiles(repository, {
      'src/types.ts': '// Stryker disable next-line all\nexport type Unit = string;\n',
    });

    const check = runCheck(repository, base);

    expect(check.status).toBe(1);
    expect(check.stdout).not.toContain('nothing to check');
    expect(check.stderr).toContain(
      '::error file=src/types.ts,line=1::This Stryker disable comment has no reason.'
    );
    expect(check.stderr).not.toContain('Stryker exited with status');
  });

  // AFA-117: on code nested too deeply to parse, the check flags each changed line with "Stryker
  // disable", and it says why, not that the comment has no reason.
  it('says why it flags a directive in a file that it cannot parse', () => {
    const repository = createRepository();
    const base = commitFiles(repository, { 'stryker.config.json': '{}\n' });
    commitFiles(repository, {
      'src/units.ts': `export const x = ${'('.repeat(5000)}1${')'.repeat(5000)};\n// Stryker disable next-line all: a reason\nexport const y = 1;\n`,
    });

    const check = runCheck(repository, base);

    expect(check.status).toBe(1);
    expect(check.stderr).toContain(
      "::error file=src/units.ts,line=2::This check can't read the comments in this file"
    );
    expect(check.stderr).not.toContain('has no reason. Add');
  });

  // Recorded from the installed Stryker 10.0.0 running six source files, two tests and ten
  // mutants. The score is 37.5%, so the run fails the unchanged break threshold of 98, yet writes
  // this complete report. See fixtures/mutation/README.md for reproduction and expectations.
  const recorded = JSON.parse(
    readFileSync(new URL('./fixtures/mutation/full.json', import.meta.url), 'utf8')
  ) as {
    files: Record<string, { source: string; mutants: Array<{ status: string }> }>;
    filesRead: Record<string, boolean>;
    testFiles: object;
  };

  it.each([
    ['src/survived.ts', 1, 'it survived'],
    ['src/covered.ts', 0, 'Tests kill every mutant'],
    ['src/orphan.ts', 1, 'no test covers it'],
    ['src/explained.ts', 0, 'Tests kill every mutant'],
    ['src/ignored.ts', 1, 'without a reason'],
  ])('filters the recorded report for %s', (file, status, message) => {
    const repository = createRepository();
    const base = commitFiles(repository, { 'README.md': 'fixture\n' });
    commitFiles(repository, { [file]: recorded.files[file].source });
    writeReport(repository, recorded);

    const check = runCheck(repository, base);

    expect(check.status).toBe(status);
    expect(check.stdout + check.stderr).toContain(message);
    expect(check.stderr).not.toContain('src/node_modules/unread.ts');
    // A report check needs no installed Stryker or second mutation run.
    expect(existsSync(resolve(repository, 'node_modules'))).toBe(false);
  });

  // AFA-131: real Stryker 10 report coordinates for the ticket's three terminators
  // and maintainer's ignored-mutant example. Expectations below count only LF by hand.
  const coordinates = JSON.parse(
    readFileSync(new URL('./fixtures/mutation/coordinates.json', import.meta.url), 'utf8')
  ) as {
    files: Record<string, { source: string; mutants: ReportMutant[] }>;
    filesRead: Record<string, boolean>;
  };

  it.each([
    ['src/cr.ts', 1, 24],
    ['src/ls.ts', 1, 24],
    ['src/ps.ts', 1, 24],
    ['src/lf.ts', 0, 11],
    ['src/crlf.ts', 0, 11],
  ])('checks git line 1 against real Babel coordinates in %s', (file, status, column) => {
    const repository = createRepository();
    const result = coordinates.files[file];
    const base = commitFiles(repository, { [file]: result.source.replace('a = 1', 'a = 0') });
    commitFiles(repository, { [file]: result.source });
    writeReport(repository, coordinates);

    const check = runCheck(repository, base);

    expect(result.mutants).toMatchObject([
      {
        replacement: 'a && 2',
        status: 'NoCoverage',
        location: { start: { line: 2, column: 11 }, end: { line: 2, column: 17 } },
      },
    ]);
    expect(check.stdout).toContain(`  ${file}:1`);
    expect(check.status).toBe(status);
    expect(check.stderr.includes(`::error file=${file},line=1,col=${column}::`)).toBe(status === 1);
    expect(check.stdout.includes('Tests kill every mutant')).toBe(status === 0);
  });

  it.each(['src/cr.ts', 'src/ls.ts', 'src/ps.ts'])(
    'does not count an unchanged mutant as changed git line 2 in %s',
    file => {
      const repository = createRepository();
      const result = coordinates.files[file];
      const base = commitFiles(repository, { [file]: result.source + 'export const c = 3;\n' });
      const source = result.source + 'export const c = 4;\n';
      commitFiles(repository, { [file]: source });
      writeReport(repository, {
        ...coordinates,
        files: { ...coordinates.files, [file]: { ...result, source } },
      });

      const check = runCheck(repository, base);

      expect(check.stdout).toContain(`  ${file}:2`);
      expect(check.status).toBe(0);
      expect(check.stdout).toContain('Tests kill every mutant');
      expect(check.stderr).toBe('');
    }
  );

  it('rejects the real ignored mutant when only git line 3 changes after U+2028', () => {
    const repository = createRepository();
    const file = 'src/ignored.ts';
    const result = coordinates.files[file];
    const base = commitFiles(repository, { [file]: result.source.replace('a ?? 2', 'a ?? 1') });
    commitFiles(repository, { [file]: result.source });
    writeReport(repository, coordinates);

    const check = runCheck(repository, base);

    // The 33 characters before "a ?? 2" put its start at column 34; its end is column 40.
    expect(result.mutants).toContainEqual(
      expect.objectContaining({
        replacement: 'a && 2',
        status: 'Ignored',
        statusReason: 'Ignored using a comment',
        location: { start: { line: 4, column: 34 }, end: { line: 4, column: 40 } },
      })
    );
    expect(check.stdout).toContain(`  ${file}:3`);
    expect(check.status).toBe(1);
    expect(check.stderr).toContain(
      '::error file=src/ignored.ts,line=3,col=34::A Stryker disable comment ignores the LogicalOperator mutant without a reason.'
    );
    // The directive is on unchanged git line 2: only the ignored-mutant path can reject it.
    expect(check.stderr).not.toContain('This Stryker disable comment has no reason.');
    expect(check.stderr).not.toContain('it survived');
  });

  it('passes a type-only file omitted from the recorded report but selected by Stryker', () => {
    const repository = createRepository();
    const base = commitFiles(repository, { 'README.md': 'fixture\n' });
    commitFiles(repository, { 'src/types.ts': 'export type Unit = string;\n' });
    writeReport(repository, recorded);

    const check = runCheck(repository, base);

    expect(recorded.files).not.toHaveProperty('src/types.ts');
    expect(recorded.filesRead['src/types.ts']).toBe(true);
    expect(check.status).toBe(0);
    expect(check.stdout).toContain('Tests kill every mutant');
  });

  it('rejects partial mutation selection even when every reported mutant is killed', () => {
    const repository = createRepository();
    const file = 'src/covered.ts';
    const source = recorded.files[file].source;
    const base = commitFiles(repository, { [file]: source });
    const changed = source + '\nexport const pick = (n: number) => n > 0 ? 1 : 0;\n';
    commitFiles(repository, { [file]: changed });
    writeReport(repository, {
      ...recorded,
      files: { ...recorded.files, [file]: { ...recorded.files[file], source: changed } },
      filesRead: {
        ...recorded.filesRead,
        [file]: [{ start: { line: 0 }, end: { line: 1 } }],
      },
    });

    const check = runCheck(repository, base);

    expect(check.status).toBe(1);
    expect(check.stderr).toContain('Select the whole file');
    expect(check.stdout).not.toContain('Tests kill every mutant');
  });

  it('fails for a changed file absent from the recorded report and Stryker inventory', () => {
    const repository = createRepository();
    const base = commitFiles(repository, { 'README.md': 'fixture\n' });
    commitFiles(repository, { 'src/node_modules/unread.ts': 'export const unread = true;\n' });
    writeReport(repository, recorded);

    const check = runCheck(repository, base);

    expect(recorded.files).not.toHaveProperty('src/node_modules/unread.ts');
    expect(recorded.filesRead).not.toHaveProperty('src/node_modules/unread.ts');
    expect(check.status).toBe(1);
    expect(check.stderr).toContain('::error file=src/node_modules/unread.ts::Move');
  });

  // Preserve all four checkout-path cases: broken globs leave ordinary source unselected,
  // while '*' and '\\' in the checkout path still allow Stryker to select it.
  it.each([
    ['a[1]', false, 1],
    ['{a,b}', false, 1],
    ['a*b', true, 0],
    ['a\\b', true, 0],
  ] as const)('checks mutation selection in repository folder %s', (folder, selected, status) => {
    const repository = createRepository(folder);
    const base = commitFiles(repository, { 'README.md': 'fixture\n' });
    commitFiles(repository, { 'src/units.ts': 'export const a = 1 > 0;\n' });
    writeReport(repository, { files: {}, filesRead: { 'src/units.ts': selected } });

    const check = runCheck(repository, base);

    expect(check.status).toBe(status);
    expect(check.stderr.includes('never read it for mutation')).toBe(!selected);
    expect(check.stdout.includes('Tests kill every mutant on the changed lines.')).toBe(selected);
  });

  it('reads a report from the requested path', () => {
    const repository = createRepository();
    const base = commitFiles(repository, { 'README.md': 'fixture\n' });
    commitFiles(repository, { 'src/covered.ts': recorded.files['src/covered.ts'].source });
    writeFileSync(resolve(repository, 'a report.json'), JSON.stringify(recorded));

    const check = runCheck(repository, base, {}, ['--report', 'a report.json']);

    expect(check.status).toBe(0);
    expect(check.stdout).toContain('Tests kill every mutant');
  });

  it.each([
    ['a missing report.json', undefined],
    ['a broken report.json', '{'],
    ['an incomplete report.json', '{"files": {}}'],
  ])('fails closed for %s', (report, contents) => {
    const repository = createRepository();
    const base = commitFiles(repository, { 'README.md': 'fixture\n' });
    commitFiles(repository, { 'src/covered.ts': recorded.files['src/covered.ts'].source });
    writeOptionalFile(repository, report, contents);

    const check = runCheck(repository, base, {}, ['--report', report]);

    expect(check.status).toBe(1);
    expect(check.stderr).toContain('::error::Cannot read the mutation report');
    expect(check.stdout).not.toContain('Tests kill every mutant');
  });

  it('removes changed source files from the cache before the single mutation run', () => {
    const repository = createRepository();
    const base = commitFiles(repository, {
      'src/covered.ts': recorded.files['src/covered.ts'].source,
      'src/survived.ts': recorded.files['src/survived.ts'].source,
      'src/types.ts': 'export type Unit = string;\n',
    });
    // Neither mutant's code span changes; git still marks line 1 as changed.
    commitFiles(repository, {
      'src/covered.ts': recorded.files['src/covered.ts'].source.trimEnd() + ' // changed\n',
      'src/types.ts': 'export type Unit = number;\n',
    });
    writeFileSync(resolve(repository, 'incremental.json'), JSON.stringify(recorded));

    const check = runCheck(repository, base, {}, ['--prepare', 'incremental.json']);
    const cached = JSON.parse(
      readFileSync(resolve(repository, 'incremental.json'), 'utf8')
    ) as typeof recorded;

    expect(check.status).toBe(0);
    expect(cached.files).not.toHaveProperty('src/covered.ts');
    expect(cached.files['src/survived.ts']).toEqual(recorded.files['src/survived.ts']);
    expect(cached.testFiles).toEqual(recorded.testFiles);
    expect(check.stdout).toContain('Removed cached mutant results for "src/covered.ts".');
    expect(check.stdout).toContain('fresh mutation results');
  });

  it('allows a cold mutation run with no cached report', () => {
    const repository = createRepository();
    const base = commitFiles(repository, { 'README.md': 'fixture\n' });
    commitFiles(repository, { 'src/covered.ts': recorded.files['src/covered.ts'].source });

    const check = runCheck(repository, base, {}, ['--prepare', 'incremental.json']);

    expect(check.status).toBe(0);
    expect(existsSync(resolve(repository, 'incremental.json'))).toBe(false);
  });
});

function writeOptionalFile(repository: string, file: string, contents: string | undefined): void {
  if (contents !== undefined) writeFileSync(resolve(repository, file), contents);
}
