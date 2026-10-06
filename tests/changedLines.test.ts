import { describe, expect, it } from 'vitest';
import {
  hunkRanges,
  isSourceFile,
  literalGlob,
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
});
