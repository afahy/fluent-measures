import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { execPath } from 'node:process';
import { describe, expect, it } from 'vitest';
import {
  backslashPaths,
  controlPaths,
  decodeNames,
  directiveLines,
  gitEnvironment,
  hunkRanges,
  isSourceFile,
  isUnmutatedCode,
  reasonlessDirectives,
  revisions,
  unexplainedIgnores,
  unkilledMutants,
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

// AFA-85: other code that tsc, Vitest and tsup read, outside the project's mutation scope.
describe('isUnmutatedCode', () => {
  it.each([
    ['src/units.mts', true],
    ['src/units.cts', true],
    ['src/units.js', true],
    ['src/units.mjs', true],
    ['src/units.cjs', true],
    ['src/units.jsx', true],
    ['src/units.tsx', true],
    ['src/units.ts', false],
    ['src/types.d.ts', false],
    ['src/types.d.mts', false],
    ['src/types.d.cts', false],
    ['src/template.mtsx', false],
    ['src/template.cjsx', false],
    ['src/data.json', false],
  ])('returns %s → %s', (file, expected) => {
    expect(isUnmutatedCode(file)).toBe(expected);
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

// AFA-131: Babel counts all JavaScript line terminators; git counts only LF. The
// nullish expression starts at column 11 of Babel line 2, after 13 UTF-16 units on git line 1.
describe('mutant git coordinates', () => {
  it.each(['\r', '\u2028', '\u2029'])(
    'finds changed mutants after %j and leaves the report untouched',
    separator => {
      const report = {
        files: {
          'src/a.ts': {
            source: `const a = 1;${separator}const b = a ?? 2;\nexport const c = 3;\n`,
            mutants: ['Survived', 'NoCoverage', 'Ignored'].map(status => ({
              ...mutant(status, [2, 2]),
              mutatorName: 'LogicalOperator',
              replacement: 'a && 2',
              location: { start: { line: 2, column: 11 }, end: { line: 2, column: 17 } },
            })),
          },
        },
      };
      const original = structuredClone(report);
      expect(
        unkilledMutants(report, new Map([['src/a.ts', [[1, 1]]]])).map(
          ({ line, column, status }) => ({ line, column, status })
        )
      ).toEqual([
        { line: 1, column: 24, status: 'Survived' },
        { line: 1, column: 24, status: 'NoCoverage' },
      ]);
      // Babel line 2 isn't git line 2: changing only the latter must not count these mutants.
      expect(unkilledMutants(report, new Map([['src/a.ts', [[2, 2]]]]))).toEqual([]);
      expect(unexplainedIgnores(report, new Map([['src/a.ts', [[1, 1]]]]))).toEqual([
        { file: 'src/a.ts', line: 1, column: 24, mutator: 'LogicalOperator' },
      ]);
      expect(unexplainedIgnores(report, new Map([['src/a.ts', [[2, 2]]]]))).toEqual([]);
      expect(report).toEqual(original);
    }
  );

  it('maps both ends of a spanning mutant across mixed terminators', () => {
    // Babel lines 2 through 5 share git line 2. Babel line 6 is git line 3.
    const report = {
      files: {
        'src/a.ts': {
          source: 'a\r\nb\rc\u2028d\u2029e\nf\n',
          mutants: [
            {
              ...mutant('Survived', [3, 6]),
              location: { start: { line: 3, column: 1 }, end: { line: 6, column: 2 } },
            },
          ],
        },
      },
    };
    const found = [{ file: 'src/a.ts', line: 2, column: 3 }];
    expect(
      unkilledMutants(report, new Map([['src/a.ts', [[2, 2]]]])).map(({ file, line, column }) => ({
        file,
        line,
        column,
      }))
    ).toEqual(found);
    expect(
      unkilledMutants(report, new Map([['src/a.ts', [[3, 3]]]])).map(({ file, line, column }) => ({
        file,
        line,
        column,
      }))
    ).toEqual(found);
    expect(unkilledMutants(report, new Map([['src/a.ts', [[4, 4]]]]))).toEqual([]);
  });

  it('resets columns after LF and counts a supplementary character as two UTF-16 units', () => {
    const report = {
      files: {
        'src/a.ts': {
          source: '// 😀\u2028a;\r\nb;\u2029c;',
          mutants: [
            {
              ...mutant('Survived', [2, 2]),
              location: { start: { line: 2, column: 1 }, end: { line: 2, column: 2 } },
            },
            {
              ...mutant('Survived', [4, 4]),
              location: { start: { line: 4, column: 1 }, end: { line: 4, column: 2 } },
            },
          ],
        },
      },
    };
    expect(
      unkilledMutants(report, new Map([['src/a.ts', [[1, 2]]]])).map(({ line, column }) => [
        line,
        column,
      ])
    ).toEqual([
      [1, 7],
      [2, 4],
    ]);
  });

  it.each(['\n', '\r\n'])(
    'preserves ordinary %j line and column coordinates, including end-line overlap',
    separator => {
      const report = {
        files: {
          'src/a.ts': {
            source: `first${separator}second${separator}third${separator}`,
            mutants: [
              {
                ...mutant('Survived', [2, 3]),
                location: { start: { line: 2, column: 2 }, end: { line: 3, column: 1 } },
              },
            ],
          },
        },
      };
      expect(
        unkilledMutants(report, new Map([['src/a.ts', [[3, 3]]]])).map(({ line, column }) => [
          line,
          column,
        ])
      ).toEqual([[2, 2]]);
      expect(unkilledMutants(report, new Map([['src/a.ts', [[1, 1]]]]))).toEqual([]);
    }
  );
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
    // A line break that Babel and TypeScript count inside a block comment, before "Stryker".
    ['x;\n/*\u2028Stryker disable all */\ny;', [[2, 2]], [2]],
    ['x;\n/*\rStryker disable all */\ny;', [[2, 2]], [2]],
    // A blank line before a directive, and two directives with lines between them.
    ['x;\n\n// Stryker disable all\ny;', [[3, 3]], [3]],
    ['// Stryker disable all\nx;\n\ny;\n// Stryker disable all\nz;', [[1, 5]], [1, 5]],
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

  // AFA-117: TypeScript gives the end of the file a JSDoc after it as a child, so the walk read no
  // comment before that JSDoc. It read the same directive with no JSDoc after it.
  it('reads a directive before a JSDoc at the end of the file', () => {
    expect(reasonlessDirectives('x;\n// Stryker disable all\n/** doc */\n', [[2, 2]])).toEqual([2]);
  });

  it('reads a directive at the end of the file', () => {
    expect(reasonlessDirectives('x;\n// Stryker disable all\n', [[2, 2]])).toEqual([2]);
  });
});

// AFA-117: the check says whether it could parse the file, so its message can say why it flags a
// line. A file it can't parse fails safe, as `reasonlessDirectives` does.
describe('directiveLines', () => {
  it.each([
    ['x;', { lines: [], parsed: true }],
    [`const x = ${'('.repeat(5000)}1${')'.repeat(5000)};`, { lines: [2], parsed: false }],
  ])('says whether it parsed the file after %#', (code, expected) => {
    const comment = '// Stryker disable next-line all: a reason';
    expect(directiveLines(`${code}\n${comment}\nx;`, [[2, 2]])).toEqual(expected);
  });
});

// AFA-117: no directive can be on a changed line that has no "Stryker", so the check reads such a
// file without TypeScript, which is 9 MB, and the other helpers never load it. A process of its own
// shows which modules this module loads.
describe('loading TypeScript', () => {
  const loads = (call: string): boolean => {
    const script = `
      import { createRequire } from 'node:module';
      import { sep } from 'node:path';
      const { reasonlessDirectives } = await import(${JSON.stringify(resolve('.github/scripts/changed-lines.mjs'))});
      ${call};
      const cache = Object.keys(createRequire(import.meta.url).cache);
      console.log(cache.some(file => file.endsWith(['', 'typescript', 'lib', 'typescript.js'].join(sep))));
    `;
    return (
      execFileSync(execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' }).trim() ===
      'true'
    );
  };

  it('doesn\'t load TypeScript when no changed line holds "Stryker"', () => {
    expect(loads("reasonlessDirectives('x;\\n// Stryker disable all\\ny;', [[3, 3]])")).toBe(false);
  });

  it('loads TypeScript to read a changed line with "Stryker"', () => {
    expect(loads("reasonlessDirectives('x;\\n// Stryker disable all\\ny;', [[2, 2]])")).toBe(true);
  });
});
