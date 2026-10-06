import { describe, expect, it } from 'vitest';
import {
  changedRanges,
  mutateEntries,
  unexplainedIgnores,
  unkilledMutants,
} from '../.github/scripts/changed-lines.mjs';

// Output of `git diff --unified=0 --no-renames` for three files: one changed in two places, one
// added, and one deleted.
const diff = `diff --git a/src/units.ts b/src/units.ts
index 1111111..2222222 100644
--- a/src/units.ts
+++ b/src/units.ts
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
diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,3 @@
+line 1
+line 2
+line 3
diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
index 4444444..0000000
--- a/src/old.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-line 1
-line 2
`;

function mutant(
  status: string,
  statusReason?: string
): {
  status: string;
  statusReason?: string;
  mutatorName: string;
  replacement: string;
  location: { start: { line: number; column: number } };
} {
  return {
    status,
    ...(statusReason === undefined ? {} : { statusReason }),
    mutatorName: 'ConditionalExpression',
    replacement: 'false',
    location: { start: { line: 7, column: 5 } },
  };
}

describe('changedRanges', () => {
  it('lists the added and changed lines of each file, and skips deletions', () => {
    expect([...changedRanges(diff)]).toEqual([
      [
        'src/units.ts',
        [
          [11, 12],
          [22, 22],
        ],
      ],
      ['src/new.ts', [[1, 3]]],
    ]);
  });

  it('returns no ranges for an empty diff', () => {
    expect(changedRanges('').size).toBe(0);
  });
});

describe('mutateEntries', () => {
  it('writes each range as a Stryker mutate entry', () => {
    expect(mutateEntries(changedRanges(diff))).toEqual([
      'src/units.ts:11-12',
      'src/units.ts:22-22',
      'src/new.ts:1-3',
    ]);
  });
});

describe('unkilledMutants', () => {
  it('returns the mutants that survived or that no test covers', () => {
    const report = {
      files: {
        'src/a.ts': {
          mutants: [
            mutant('Killed'),
            mutant('Survived'),
            mutant('Timeout'),
            mutant('NoCoverage'),
            mutant('Ignored', 'the fallback is never read'),
          ],
        },
      },
    };
    expect(unkilledMutants(report)).toEqual([
      {
        file: 'src/a.ts',
        line: 7,
        column: 5,
        mutator: 'ConditionalExpression',
        replacement: 'false',
        status: 'Survived',
      },
      {
        file: 'src/a.ts',
        line: 7,
        column: 5,
        mutator: 'ConditionalExpression',
        replacement: 'false',
        status: 'NoCoverage',
      },
    ]);
  });
});

describe('unexplainedIgnores', () => {
  it('returns the mutants that a disable comment ignores without a reason', () => {
    const report = {
      files: {
        'src/a.ts': {
          mutants: [
            mutant('Ignored', 'the fallback is never read'),
            mutant('Ignored', 'Ignored using a comment'),
            mutant('Ignored', '  '),
            mutant('Ignored'),
            mutant('Survived'),
          ],
        },
      },
    };
    const unexplained = { file: 'src/a.ts', line: 7, column: 5, mutator: 'ConditionalExpression' };
    expect(unexplainedIgnores(report)).toEqual([unexplained, unexplained, unexplained]);
  });
});
