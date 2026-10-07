// Helpers for .github/scripts/mutation-check.mjs: the lines that a pull request adds or changes,
// and the mutants on them in a Stryker JSON report that no test kills.

import { matchesGlob } from 'node:path';

/**
 * Returns the revisions to compare: the base and HEAD in CI, where HEAD is a merge commit whose
 * first parent is the base, or `<base>...HEAD` for a `--base` from the command line. The second
 * form starts from the merge base, so changes that only the base has don't count.
 *
 * @param {string} base
 * @param {{ fromMergeBase: boolean }} options
 * @returns {string[]}
 */
export function revisions(base, { fromMergeBase }) {
  return fromMergeBase ? [`${base}...HEAD`] : [base, 'HEAD'];
}

// Environment variables that change how git reads a pathspec or writes a diff. With
// GIT_LITERAL_PATHSPECS, for example, git reads `:(literal)src/` as a plain path, which matches
// nothing.
const GIT_OUTPUT_VARIABLES = new Set([
  'GIT_LITERAL_PATHSPECS',
  'GIT_GLOB_PATHSPECS',
  'GIT_NOGLOB_PATHSPECS',
  'GIT_ICASE_PATHSPECS',
  'GIT_DIFF_OPTS',
]);

/**
 * Returns `env` without the variables that change how git reads a pathspec or writes a diff.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {Record<string, string | undefined>}
 */
export function gitEnvironment(env) {
  return Object.fromEntries(
    Object.entries(env).filter(([name]) => !GIT_OUTPUT_VARIABLES.has(name))
  );
}

/**
 * Splits the NUL-separated file names that git writes into the names that are valid UTF-8 and the
 * names that aren't. Node opens a file by a UTF-8 name, so it can't open a file in the second
 * group. Those names come back with U+FFFD in place of each invalid byte sequence.
 *
 * @param {Uint8Array} output
 * @returns {{ names: string[], invalid: string[] }}
 */
export function decodeNames(output) {
  const strict = new TextDecoder('utf-8', { fatal: true });
  const loose = new TextDecoder('utf-8');
  /** @type {string[]} */
  const names = [];
  /** @type {string[]} */
  const invalid = [];
  for (let start = 0; start < output.length; ) {
    let end = output.indexOf(0, start);
    if (end === -1) end = output.length;
    if (end > start) {
      const bytes = output.subarray(start, end);
      try {
        names.push(strict.decode(bytes));
      } catch {
        invalid.push(loose.decode(bytes));
      }
    }
    start = end + 1;
  }
  return { names, invalid };
}

/**
 * Returns the files whose `mutate` pattern, from `literalGlob`, matched no file in Stryker's run,
 * from the warnings in its log. Stryker never reads some folders, such as `node_modules`, so it
 * can't mutate a file in them. A file without mutants, such as one with only types, still matches.
 *
 * @param {string} log
 * @param {string[]} files
 * @returns {string[]}
 */
export function unmatchedFiles(log, files) {
  const patterns = new Set(
    [...log.matchAll(/Glob pattern "(.*)" did not result in any files\./g)].map(
      ([, pattern]) => pattern
    )
  );
  return files.filter(file => patterns.has(literalGlob(file)));
}

/**
 * Returns whether Stryker mutates `file`: a TypeScript source file, not a declaration file.
 *
 * @param {string} file
 * @returns {boolean}
 */
export function isSourceFile(file) {
  return file.endsWith('.ts') && !file.endsWith('.d.ts');
}

/**
 * Returns the files that the `mutate` patterns in the Stryker config cover. As in Stryker, a
 * pattern that starts with "!" leaves files out. The project's pattern leaves out test files under
 * `src/`: Vitest finds tests only under `tests/`, so their mutants would get no coverage.
 *
 * @param {string[]} files
 * @param {string[]} patterns
 * @returns {string[]}
 */
export function mutatedFiles(files, patterns) {
  const matches = (/** @type {string} */ file, /** @type {boolean} */ negated) =>
    patterns.some(
      pattern => pattern.startsWith('!') === negated && matchesGlob(file, pattern.replace(/^!/, ''))
    );
  return files.filter(file => matches(file, false) && !matches(file, true));
}

/**
 * Returns the paths that have a control character, such as a line break or an escape.
 *
 * @param {string[]} files
 * @returns {string[]}
 */
export function controlPaths(files) {
  return files.filter(file => /[\p{Cc}\u2028\u2029]/u.test(file));
}

/**
 * Returns the paths that have a backslash. Stryker reads a backslash as a slash. So its report
 * names `src/a\b.ts` as `src/a/b.ts`, and the check can't find that file's mutants.
 *
 * @param {string[]} files
 * @returns {string[]}
 */
export function backslashPaths(files) {
  return files.filter(file => file.includes('\\'));
}

/**
 * Returns `file` as a glob pattern that matches only that file. Stryker reads `mutate` entries
 * as globs, so a name such as `src/[u]nits.ts` would otherwise match `src/units.ts`. Each glob
 * character goes in a bracket of its own, such as `[[]` for `[`. Stryker turns backslashes into
 * slashes, so a backslash escape doesn't work.
 *
 * @param {string} file
 * @returns {string}
 */
export function literalGlob(file) {
  return file.replace(/[*?[\]{}()]/g, character => (character === ']' ? '[]]' : `[${character}]`));
}

/**
 * Returns the line ranges that `git diff --unified=0` output for one file adds or changes. It
 * reads only the hunk headers, so file names in the diff don't matter. A hunk that only deletes
 * lines adds no range.
 *
 * @param {string} diff
 * @returns {Array<[number, number]>}
 */
export function hunkRanges(diff) {
  /** @type {Array<[number, number]>} */
  const ranges = [];
  for (const [, from, count = '1'] of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    if (Number(count) > 0) ranges.push([Number(from), Number(from) + Number(count) - 1]);
  }
  return ranges;
}

/**
 * @typedef {object} ReportMutant
 * @property {string} status
 * @property {string} [statusReason]
 * @property {string} mutatorName
 * @property {string} [replacement]
 * @property {{ start: { line: number, column: number }, end: { line: number, column: number } }} location
 */

/**
 * @typedef {{ files: Record<string, { mutants: ReportMutant[] }> }} Report
 */

/**
 * Returns each mutant in the report whose code overlaps a changed line, with its file. Stryker
 * mutates whole files, so a mutant whose code spans more lines than the change, such as an
 * operator in a multi-line expression, still counts.
 *
 * @param {Report} report
 * @param {Map<string, Array<[number, number]>>} changed
 * @returns {Array<{ file: string, mutant: ReportMutant }>}
 */
function changedMutants(report, changed) {
  return Object.entries(report.files).flatMap(([file, { mutants }]) =>
    mutants
      .filter(({ location }) =>
        (changed.get(file) ?? []).some(
          ([from, to]) => location.start.line <= to && location.end.line >= from
        )
      )
      .map(mutant => ({ file, mutant }))
  );
}

/**
 * @typedef {object} UnkilledMutant
 * @property {string} file
 * @property {number} line
 * @property {number} column
 * @property {string} mutator
 * @property {string} replacement
 * @property {'Survived' | 'NoCoverage'} status
 */

/**
 * Returns the mutants on changed lines that survived or that no test covers. A mutant that a
 * `// Stryker disable` comment ignores has the status Ignored, so it isn't returned.
 *
 * @param {Report} report
 * @param {Map<string, Array<[number, number]>>} changed
 * @returns {UnkilledMutant[]}
 */
export function unkilledMutants(report, changed) {
  return changedMutants(report, changed)
    .filter(({ mutant }) => mutant.status === 'Survived' || mutant.status === 'NoCoverage')
    .map(({ file, mutant }) => ({
      file,
      line: mutant.location.start.line,
      column: mutant.location.start.column,
      mutator: mutant.mutatorName,
      replacement: mutant.replacement ?? '',
      status: /** @type {'Survived' | 'NoCoverage'} */ (mutant.status),
    }));
}

/** The reason Stryker gives a mutant that a disable comment without a reason ignores. */
const DEFAULT_IGNORE_REASON = 'Ignored using a comment';

/**
 * Returns the mutants on changed lines that a `// Stryker disable` comment ignores without a
 * reason. Each one needs a reason that says why behavior can't change.
 *
 * @param {Report} report
 * @param {Map<string, Array<[number, number]>>} changed
 * @returns {Array<{ file: string, line: number, column: number, mutator: string }>}
 */
export function unexplainedIgnores(report, changed) {
  return changedMutants(report, changed)
    .filter(
      ({ mutant }) =>
        mutant.status === 'Ignored' &&
        (!mutant.statusReason?.trim() || mutant.statusReason === DEFAULT_IGNORE_REASON)
    )
    .map(({ file, mutant }) => ({
      file,
      line: mutant.location.start.line,
      column: mutant.location.start.column,
      mutator: mutant.mutatorName,
    }));
}

// Stryker's own pattern for a directive, from `@stryker-mutator/instrumenter`
// (`directive-bookkeeper.js`). Stryker matches it to the text of each comment, without `//`, `/*`
// and `*/`. A directive with no text after the colon gets Stryker's default reason.
const DIRECTIVE = /^\s?Stryker disable(?: next-line)? [a-zA-Z, ]+(?::(.+))?/;

/**
 * Returns the text of each comment that a line can hold: each block comment, and the rest of the
 * line after each `//` outside them. A `//` inside a string, as in a URL, gives text that isn't a
 * comment, but that text doesn't start with a directive.
 *
 * @param {string} line
 * @returns {string[]}
 */
function commentTexts(line) {
  /** @type {string[]} */
  const texts = [];
  const rest = line.replace(/\/\*(.*?)\*\//g, (_, text) => {
    texts.push(text);
    return ' ';
  });
  for (const [, text] of rest.matchAll(/\/\/(?=(.*))/g)) texts.push(text);
  return texts;
}

/**
 * Returns the changed lines of `source` that hold a Stryker disable directive without a reason.
 * A directive can ignore mutants on lines that didn't change, such as the line after a
 * `disable next-line`, so the directive itself is checked. Each comment on a line is read as
 * Stryker reads it, so a block comment's closing `*\/` isn't a reason, and another directive on the
 * same line doesn't give it one.
 *
 * @param {string} source
 * @param {Array<[number, number]>} ranges
 * @returns {number[]}
 */
export function reasonlessDirectives(source, ranges) {
  return source
    .split('\n')
    .map((text, index) => ({ text, line: index + 1 }))
    .filter(
      ({ text, line }) =>
        ranges.some(([from, to]) => line >= from && line <= to) &&
        commentTexts(text).some(comment => {
          const match = DIRECTIVE.exec(comment);
          return match !== null && !match[1]?.trim();
        })
    )
    .map(({ line }) => line);
}
