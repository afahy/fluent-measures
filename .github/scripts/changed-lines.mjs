// Helpers for .github/scripts/mutation-check.mjs: the lines that a diff adds or changes, and the
// mutants in a Stryker JSON report that no test kills.

/**
 * Returns the line ranges that `git diff --unified=0` output adds or changes, by file. A hunk
 * that only deletes lines adds no range, and a deleted file adds no file.
 *
 * @param {string} diff
 * @returns {Map<string, Array<[number, number]>>}
 */
export function changedRanges(diff) {
  /** @type {Map<string, Array<[number, number]>>} */
  const ranges = new Map();
  /** @type {string | null} */
  let file = null;
  for (const line of diff.split('\n')) {
    const header = /^\+\+\+ (?:b\/(.+)|\/dev\/null)$/.exec(line);
    if (header) {
      file = header[1] ?? null;
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk && file !== null) {
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      if (count > 0) ranges.set(file, [...(ranges.get(file) ?? []), [start, start + count - 1]]);
    }
  }
  return ranges;
}

/**
 * Returns the arguments for `git diff` that list the lines HEAD adds or changes under src/. The
 * prefixes are fixed, so the user's git settings can't change the output that `changedRanges`
 * reads. A base from `--base` is compared from its merge base with HEAD, so changes that only the
 * base has don't count.
 *
 * @param {string} base
 * @param {{ fromMergeBase: boolean }} options
 * @returns {string[]}
 */
export function diffArguments(base, { fromMergeBase }) {
  return [
    'diff',
    '--unified=0',
    '--no-renames',
    '--no-color',
    '--no-ext-diff',
    '--src-prefix=a/',
    '--dst-prefix=b/',
    ...(fromMergeBase ? [`${base}...HEAD`] : [base, 'HEAD']),
    '--',
    'src/',
  ];
}

/**
 * Keeps the ranges of TypeScript source files, which Stryker mutates. Declaration files have
 * nothing to mutate.
 *
 * @param {Map<string, Array<[number, number]>>} ranges
 * @returns {Map<string, Array<[number, number]>>}
 */
export function sourceRanges(ranges) {
  return new Map([...ranges].filter(([file]) => file.endsWith('.ts') && !file.endsWith('.d.ts')));
}

/**
 * Returns a Stryker `mutate` entry for each range, such as `src/units.ts:10-12`.
 *
 * @param {Map<string, Array<[number, number]>>} ranges
 * @returns {string[]}
 */
export function mutateEntries(ranges) {
  return [...ranges].flatMap(([file, list]) => list.map(([from, to]) => `${file}:${from}-${to}`));
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
 * Returns the mutants in a Stryker JSON report that survived or that no test covers. A mutant
 * that a `// Stryker disable` comment ignores has the status Ignored, so it isn't returned.
 *
 * @param {{ files: Record<string, { mutants: Array<{ status: string, mutatorName: string, replacement?: string, location: { start: { line: number, column: number } } }> }> }} report
 * @returns {UnkilledMutant[]}
 */
export function unkilledMutants(report) {
  return Object.entries(report.files).flatMap(([file, { mutants }]) =>
    mutants
      .filter(mutant => mutant.status === 'Survived' || mutant.status === 'NoCoverage')
      .map(mutant => ({
        file,
        line: mutant.location.start.line,
        column: mutant.location.start.column,
        mutator: mutant.mutatorName,
        replacement: mutant.replacement ?? '',
        status: /** @type {'Survived' | 'NoCoverage'} */ (mutant.status),
      }))
  );
}

/** The reason Stryker gives a mutant that a disable comment without a reason ignores. */
const DEFAULT_IGNORE_REASON = 'Ignored using a comment';

/**
 * Returns the mutants in a Stryker JSON report that a `// Stryker disable` comment ignores
 * without a reason. Each one needs a reason that says why behavior can't change.
 *
 * @param {{ files: Record<string, { mutants: Array<{ status: string, statusReason?: string, mutatorName: string, location: { start: { line: number, column: number } } }> }> }} report
 * @returns {Array<{ file: string, line: number, column: number, mutator: string }>}
 */
export function unexplainedIgnores(report) {
  return Object.entries(report.files).flatMap(([file, { mutants }]) =>
    mutants
      .filter(
        mutant =>
          mutant.status === 'Ignored' &&
          (!mutant.statusReason?.trim() || mutant.statusReason === DEFAULT_IGNORE_REASON)
      )
      .map(mutant => ({
        file,
        line: mutant.location.start.line,
        column: mutant.location.start.column,
        mutator: mutant.mutatorName,
      }))
  );
}
