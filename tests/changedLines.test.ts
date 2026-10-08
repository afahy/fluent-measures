import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  backslashPaths,
  controlPaths,
  decodeNames,
  gitEnvironment,
  hunkRanges,
  isSourceFile,
  literalGlob,
  mutatedFiles,
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
  ])('returns %s → %s', (file, expected) => {
    expect(isSourceFile(file)).toBe(expected);
  });
});

// AFA-72: the check mutates only the changed files that stryker.config.json mutates.
describe('mutatedFiles', () => {
  const { mutate } = JSON.parse(
    readFileSync(new URL('../stryker.config.json', import.meta.url), 'utf8')
  ) as { mutate: string[] };

  it('leaves out the test files that the project config leaves out', () => {
    const files = [
      'src/units.ts',
      'src/parse/units.ts',
      'src/units.test.ts',
      'src/units.spec.ts',
      'src/parse/units.test.ts',
      'src/test.ts',
    ];
    expect(mutatedFiles(files, mutate)).toEqual([
      'src/units.ts',
      'src/parse/units.ts',
      'src/test.ts',
    ]);
  });

  // Codex, round 1 of #81: Stryker applies the patterns in order, and ignores a line range.
  it.each([
    [['src/**/*.ts', '!src/a.ts'], ['src/b.ts']],
    [
      ['!src/a.ts', 'src/**/*.ts'],
      ['src/a.ts', 'src/b.ts'],
    ],
    [['src/a.ts:1-10'], ['src/a.ts']],
    [
      ['src/a.ts:1:2-10:4', 'src/b.ts'],
      ['src/a.ts', 'src/b.ts'],
    ],
    // Codex, round 2 of #81: Stryker reads a pattern from the project folder.
    [['./src/**/*.ts', '!./src/b.ts'], ['src/a.ts']],
    // AFA-113: an absolute pattern too, as Stryker resolves each pattern.
    [[resolve('src/**/*.ts'), `!${resolve('src/b.ts')}`], ['src/a.ts']],
  ])('applies %j in order', (patterns, expected) => {
    expect(mutatedFiles(['src/a.ts', 'src/b.ts'], patterns)).toEqual(expected);
  });

  // Stryker resolves each pattern from the project folder, so "../repo/" names the same files.
  // The project folder's own path isn't a glob, even with "[" and "]" in it.
  it('reads patterns in a project folder whose path has glob characters', () => {
    expect(mutatedFiles(['src/a.ts'], ['src/**/*.ts'], '/tmp/a[1]/repo')).toEqual(['src/a.ts']);
  });

  it('reads a pattern that leaves the project folder and comes back', () => {
    expect(
      mutatedFiles(
        ['src/a.ts', 'src/b.ts'],
        ['../repo/src/**/*.ts', '!../repo/src/b.ts'],
        '/x/repo'
      )
    ).toEqual(['src/a.ts']);
  });

  it('leaves out the files that a pattern with "!" matches, as Stryker does', () => {
    expect(
      mutatedFiles(['src/a.ts', 'src/b.ts', 'lib/c.ts'], ['src/**/*.ts', '!src/b.ts'])
    ).toEqual(['src/a.ts']);
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

  // AFA-72: Stryker reads each comment's text, without "//", "/*" and "*/", and a directive must
  // start that text. So the "*/" that ends a block comment isn't a reason.
  it.each([
    ['/* Stryker disable next-line all: */', [1]],
    ['/* Stryker disable next-line all:*/', [1]],
    ['/* Stryker disable next-line all */', [1]],
    ['/* Stryker disable next-line all: the fallback is never read */', []],
    ['x; /* Stryker disable all: generated table */ y;', []],
    // Each directive on a line needs its own reason.
    ['/* Stryker disable all */ x; /* Stryker disable next-line Regex: a reason */', [1]],
    // A "//" in a string before the comment, as in a URL.
    ["const url = 'https://a.example'; // Stryker disable next-line all", [1]],
    // A reason can start with any text, "*/" too.
    ['// Stryker disable next-line all: */ is part of the reason', []],
    // Stryker doesn't read these as directives, so they ignore no mutants.
    ['/** Stryker disable next-line all */', []],
    ['/* see the Stryker disable docs */', []],
    ['// Stryker restore all', []],
  ])('checks %s', (line, expected) => {
    expect(reasonlessDirectives(`${line}\nconst b = a ?? 2;`, [[1, 1]])).toEqual(expected);
  });

  // AFA-115: git breaks lines only at "\n". So a lone "\r", U+2028 or U+2029 before a directive
  // leaves it on git's line 1, and "\r\n" ends a line, as before.
  it.each<[string, Array<[number, number]>, number[]]>([
    ['const a = 1;\r// Stryker disable next-line all\nconst b = a ?? 2;', [[1, 1]], [1]],
    ['const a = 1;\u2028// Stryker disable next-line all\nconst b = a ?? 2;', [[1, 1]], [1]],
    ['const a = 1;\u2029// Stryker disable next-line all\nconst b = a ?? 2;', [[1, 1]], [1]],
    ['const a = 1;\r\n// Stryker disable next-line all\r\nconst b = a ?? 2;', [[2, 2]], [2]],
    // Git's line 2 holds only "y;", so the directive isn't on a changed line.
    ['x;\u2028// Stryker disable all\ny;', [[2, 2]], []],
  ])('counts lines as git does in %j', (source, ranges, expected) => {
    expect(reasonlessDirectives(source, ranges)).toEqual(expected);
  });

  // Codex, round 1 of #81: a block comment can end on a later line. Stryker reads its directive
  // up to the line break, as on main, where any line with "Stryker disable" and no reason failed.
  it.each([
    ['/* Stryker disable next-line all\n*/', [1]],
    ['/* Stryker disable next-line all:\n   a reason on the next line */', [1]],
    ['/* Stryker disable next-line all: a reason\n*/', []],
    ['/*\n Stryker disable next-line all */', []],
  ])('checks the block comment over two lines %j', (comment, expected) => {
    expect(reasonlessDirectives(`${comment}\nconst b = a ?? 2;`, [[1, 2]])).toEqual(expected);
  });

  // Codex, round 2 of #81: Stryker allows one line break before the directive, so it reads this
  // comment's second line. Only that line changed here.
  it.each([
    ['/*\nStryker disable next-line all\n*/', [2]],
    ['/*\nStryker disable next-line all: a reason\n*/', []],
  ])('checks a directive on the line after "/*" in %j', (comment, expected) => {
    expect(reasonlessDirectives(`${comment}\nconst b = a ?? 2;`, [[2, 2]])).toEqual(expected);
  });

  // AFA-113: the TypeScript parser finds the comments, so a "/*" or "//" in a string, a template
  // literal, a regex literal or another comment doesn't hide a later directive or make one. Only
  // line 2 changed in each.
  it.each([
    ['// files under src/*\n// Stryker disable next-line all', [2]],
    ["const glob = 'src/**';\n// Stryker disable next-line all", [2]],
    ['const re = /^\\/*/;\n// Stryker disable next-line all', [2]],
    ['const t = `${a}/*`;\n// Stryker disable next-line all', [2]],
    ["const a = 1;\nconst s = '// Stryker disable all';", []],
    // A JSDoc tag starts a node inside the comment. The "//" after it is still part of the JSDoc.
    ['/**\n * @param a // Stryker disable next-line all\n */', []],
  ])('reads only real comments in %j', (code, expected) => {
    expect(reasonlessDirectives(`${code}\nconst b = a ?? 2;`, [[2, 2]])).toEqual(expected);
  });

  // A list with more children than a call can take as arguments.
  it('reads a directive after a list with 70,000 elements', () => {
    const code = `const x = [${Array.from({ length: 70_000 }, () => '1').join(', ')}];`;
    expect(reasonlessDirectives(`${code}\n// Stryker disable next-line all\nx;`, [[2, 2]])).toEqual(
      [2]
    );
  });

  // The parser itself overflows on code nested thousands of levels deep. The check then fails safe
  // and flags each changed line with "Stryker disable" and no reason, as main did.
  it.each([
    ['// Stryker disable next-line all', [2]],
    ['/* Stryker disable all: */', [2]],
    // The comments can't be read, so even a directive with a reason is flagged.
    ['// Stryker disable next-line all: a reason', [2]],
    ['// a comment', []],
  ])('fails safe for %j after code nested 5,000 levels deep', (comment, expected) => {
    const code = `const x = ${'('.repeat(5000)}1${')'.repeat(5000)};`;
    expect(reasonlessDirectives(`${code}\n${comment}\nx;`, [[2, 2]])).toEqual(expected);
  });

  // TypeScript builds JSDoc-type nodes for some code too, as for "?" here. Only JSDoc comments are
  // skipped.
  it('reads a directive inside a JSDoc-type node', () => {
    expect(
      reasonlessDirectives('let a: ?\n// Stryker disable next-line all\nstring;', [[2, 2]])
    ).toEqual([2]);
  });

  // AFA-113: the walk keeps its own stack, so a long expression doesn't overflow the call stack.
  it('reads a directive after an expression with 20,000 terms', () => {
    const code = `const x = ${Array.from({ length: 20_000 }, () => 'a').join(' + ')};`;
    expect(reasonlessDirectives(`${code}\n// Stryker disable next-line all\nx;`, [[2, 2]])).toEqual(
      [2]
    );
  });
});
