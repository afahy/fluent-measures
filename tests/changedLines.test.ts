import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  backslashPaths,
  controlPaths,
  decodeNames,
  gitEnvironment,
  hunkRanges,
  isSourceFile,
  literalGlob,
  reasonlessDirectives,
  revisions,
  unexplainedIgnores,
  unkilledMutants,
  unmatchedFiles,
} from '../.github/scripts/changed-lines.mjs';

// Output of `git diff --unified=0` for one file: an insertion, a one-line change, a deletion and
// a three-line change. The file name in the header doesn't matter, so it's quoted here as git
// quotes a name with non-ASCII characters.
const diff = `diff --git "a/src/caf\\303\\251.ts" "b/src/caf\\303\\251.ts"
index 1111111..2222222 100644
--- "a/src/caf\\303\\251.ts"
+++ "b/src/caf\\303\\251.ts"
@@ -10,0 +11,2 @@ export const UNITS = {
+  added line 11
+  added line 12
@@ -20 +22 @@ function matchUnit() {
-  old line 20
+  new line 22
@@ -30,3 +33,0 @@ function other() {
-  deleted
-  deleted
-  deleted
@@ -40,2 +37,3 @@ function last() {
-  old
-  old
+  new line 37
+  new line 38
+  new line 39
`;

function mutant(
  status: string,
  [startLine, endLine]: [number, number],
  statusReason?: string
): {
  status: string;
  statusReason?: string;
  mutatorName: string;
  replacement: string;
  location: { start: { line: number; column: number }; end: { line: number; column: number } };
} {
  return {
    status,
    ...(statusReason === undefined ? {} : { statusReason }),
    mutatorName: 'ConditionalExpression',
    replacement: 'false',
    location: { start: { line: startLine, column: 5 }, end: { line: endLine, column: 9 } },
  };
}

describe('revisions', () => {
  it('compares the merge commit with its first parent in CI', () => {
    expect(revisions('HEAD^1', { fromMergeBase: false })).toEqual(['HEAD^1', 'HEAD']);
  });

  it('compares a --base from its merge base with HEAD', () => {
    expect(revisions('origin/main', { fromMergeBase: true })).toEqual(['origin/main...HEAD']);
  });
});

describe('isSourceFile', () => {
  it.each([
    ['src/units.ts', true],
    ['src/a b.ts', true],
    ['src/café.ts', true],
    ['src/types.d.ts', false],
    ['src/data.json', false],
    // AFA-72: stryker.config.json doesn't mutate test files in src/.
    ['src/units.test.ts', false],
    ['src/units.spec.ts', false],
    ['src/test.ts', true],
  ])('returns %s → %s', (file, expected) => {
    expect(isSourceFile(file)).toBe(expected);
  });

  // isSourceFile repeats the files that this pattern leaves out, so a change to it must change
  // isSourceFile too.
  it('matches the mutate pattern in stryker.config.json', () => {
    const config = JSON.parse(
      readFileSync(new URL('../stryker.config.json', import.meta.url), 'utf8')
    );
    expect(config.mutate).toEqual(['src/**/!(*.spec|*.test).ts']);
  });
});

describe('gitEnvironment', () => {
  it('leaves out the variables that change pathspecs and diffs, and keeps the others', () => {
    expect(
      gitEnvironment({
        PATH: '/bin',
        GIT_DIR: '.git',
        GIT_LITERAL_PATHSPECS: '1',
        GIT_GLOB_PATHSPECS: '1',
        GIT_NOGLOB_PATHSPECS: '1',
        GIT_ICASE_PATHSPECS: '1',
        GIT_DIFF_OPTS: '--unified=3',
      })
    ).toEqual({ PATH: '/bin', GIT_DIR: '.git' });
  });
});

describe('decodeNames', () => {
  it('splits the names that are valid UTF-8 from the others', () => {
    // "src/caf" + the byte 0xE9 + ".ts" isn't valid UTF-8. Two NULs in a row make an empty name.
    const output = Buffer.concat([
      Buffer.from('src/a.ts\0src/caf'),
      Buffer.from([0xe9]),
      Buffer.from('.ts\0\0src/café.ts\0'),
    ]);
    expect(decodeNames(output)).toEqual({
      names: ['src/a.ts', 'src/café.ts'],
      invalid: ['src/caf\uFFFD.ts'],
    });
  });

  it('returns no names for empty output', () => {
    expect(decodeNames(new Uint8Array())).toEqual({ names: [], invalid: [] });
  });
});

describe('unmatchedFiles', () => {
  it('returns the files whose pattern Stryker says matched no file', () => {
    const log = [
      '10:00:00 (1) WARN ProjectReader Glob pattern "src/node_modules/x.ts" did not result in any files.',
      '10:00:00 (1) WARN ProjectReader Glob pattern "src/[[]u[]]nits.ts" did not result in any files.',
      '10:00:00 (1) WARN ProjectReader Glob pattern "!src/units.ts" did not exclude any files.',
    ].join('\n');
    expect(
      unmatchedFiles(log, ['src/node_modules/x.ts', 'src/[u]nits.ts', 'src/units.ts'])
    ).toEqual(['src/node_modules/x.ts', 'src/[u]nits.ts']);
  });

  it('returns no files for a log without warnings', () => {
    expect(unmatchedFiles('', ['src/units.ts'])).toEqual([]);
  });
});

describe('controlPaths', () => {
  it('returns the paths with a control character', () => {
    expect(
      controlPaths([
        'src/a\nb.ts',
        'src/units.ts',
        'src/c\u001bd.ts',
        'src/e\u2028f.ts',
        'src/café.ts',
      ])
    ).toEqual(['src/a\nb.ts', 'src/c\u001bd.ts', 'src/e\u2028f.ts']);
  });
});

describe('backslashPaths', () => {
  // In these strings, `\\` is one backslash: the first path is src/a\b.ts.
  it('returns the paths that have a backslash', () => {
    expect(
      backslashPaths(['src/a\\b.ts', 'src/units.ts', 'src/[u]nits.ts', 'src/c\\d/e.ts'])
    ).toEqual(['src/a\\b.ts', 'src/c\\d/e.ts']);
  });

  it('returns no paths when none has a backslash', () => {
    expect(backslashPaths(['src/units.ts', 'src/a/b.ts'])).toEqual([]);
  });
});

describe('literalGlob', () => {
  it.each([
    ['src/units.ts', 'src/units.ts'],
    ['src/[u]nits.ts', 'src/[[]u[]]nits.ts'],
    ['src/a(b){c}*?.ts', 'src/a[(]b[)][{]c[}][*][?].ts'],
  ])('writes %s as %s', (file, pattern) => {
    expect(literalGlob(file)).toBe(pattern);
  });
});

describe('hunkRanges', () => {
  it('lists the added and changed lines, and skips hunks that only delete', () => {
    expect(hunkRanges(diff)).toEqual([
      [11, 12],
      [22, 22],
      [37, 39],
    ]);
  });

  it('returns no ranges for an empty diff', () => {
    expect(hunkRanges('')).toEqual([]);
  });
});

describe('unkilledMutants', () => {
  const changed = new Map<string, Array<[number, number]>>([['src/a.ts', [[22, 22]]]]);

  it('returns the mutants on changed lines that survived or that no test covers', () => {
    const report = {
      files: {
        'src/a.ts': {
          mutants: [
            mutant('Killed', [22, 22]),
            mutant('Survived', [22, 22]),
            mutant('Timeout', [22, 22]),
            mutant('NoCoverage', [22, 22]),
            mutant('Ignored', [22, 22], 'the fallback is never read'),
          ],
        },
      },
    };
    expect(unkilledMutants(report, changed)).toEqual([
      {
        file: 'src/a.ts',
        line: 22,
        column: 5,
        mutator: 'ConditionalExpression',
        replacement: 'false',
        status: 'Survived',
      },
      {
        file: 'src/a.ts',
        line: 22,
        column: 5,
        mutator: 'ConditionalExpression',
        replacement: 'false',
        status: 'NoCoverage',
      },
    ]);
  });

  it('counts a mutant whose code spans the changed line, and skips the others', () => {
    const report = {
      files: {
        'src/a.ts': {
          mutants: [
            mutant('Survived', [20, 25]),
            mutant('Survived', [21, 21]),
            mutant('Survived', [23, 30]),
          ],
        },
        'src/b.ts': { mutants: [mutant('Survived', [22, 22])] },
      },
    };
    expect(unkilledMutants(report, changed).map(({ file, line }) => [file, line])).toEqual([
      ['src/a.ts', 20],
    ]);
  });
});

describe('unexplainedIgnores', () => {
  it('returns the mutants on changed lines that a disable comment ignores without a reason', () => {
    const changed = new Map<string, Array<[number, number]>>([['src/a.ts', [[7, 7]]]]);
    const report = {
      files: {
        'src/a.ts': {
          mutants: [
            mutant('Ignored', [7, 7], 'the fallback is never read'),
            mutant('Ignored', [7, 7], 'Ignored using a comment'),
            mutant('Ignored', [7, 7], '  '),
            mutant('Ignored', [7, 7]),
            mutant('Ignored', [9, 9]),
            mutant('Survived', [7, 7]),
          ],
        },
      },
    };
    const unexplained = { file: 'src/a.ts', line: 7, column: 5, mutator: 'ConditionalExpression' };
    expect(unexplainedIgnores(report, changed)).toEqual([unexplained, unexplained, unexplained]);
  });
});

describe('reasonlessDirectives', () => {
  const source = [
    'const a = 1;',
    '// Stryker disable next-line all',
    'const b = a ?? 2;',
    '// Stryker disable next-line ConditionalExpression: the fallback is never read',
    '// Stryker disable StringLiteral,ArrayDeclaration',
    '// Stryker disable all: generated table',
    '// Stryker restore all',
  ].join('\n');

  it('returns the changed lines with a disable comment that has no reason', () => {
    expect(reasonlessDirectives(source, [[1, 7]])).toEqual([2, 5]);
  });

  it('ignores directives on unchanged lines', () => {
    expect(reasonlessDirectives(source, [[3, 4]])).toEqual([]);
  });

  // AFA-72: Stryker reads a directive in a block comment too. The "*/" that ends the comment
  // isn't a reason.
  it.each([
    ['/* Stryker disable next-line all: */', [1]],
    ['/* Stryker disable next-line all:*/', [1]],
    ['/* Stryker disable next-line all */', [1]],
    ['/* Stryker disable next-line all: the fallback is never read */', []],
    ['x; /* Stryker disable all: generated table */ y;', []],
  ])('checks the block comment %s', (line, expected) => {
    expect(reasonlessDirectives(`${line}\nconst b = a ?? 2;`, [[1, 1]])).toEqual(expected);
  });
});
