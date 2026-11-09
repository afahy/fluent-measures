// Helpers for .github/scripts/mutation-check.mjs: the lines that a pull request adds or changes,
// and the mutants on them in a Stryker JSON report that no test kills.

import { createRequire } from 'node:module';

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
 * Returns whether Stryker mutates `file`: a TypeScript source file, not a declaration file.
 *
 * @param {string} file
 * @returns {boolean}
 */
export function isSourceFile(file) {
  return file.endsWith('.ts') && !file.endsWith('.d.ts');
}

/**
 * Returns whether `file` is code that `isSourceFile` leaves out, such as `.mts`, `.cts`, `.js` or
 * `.tsx`, outside the project's mutation scope. `tsc`, Vitest and tsup still use such a file. A
 * declaration file has no code.
 *
 * @param {string} file
 * @returns {boolean}
 */
export function isUnmutatedCode(file) {
  return (
    /\.(?:[cm]?[jt]s|[jt]sx)$/.test(file) && !isSourceFile(file) && !/\.d\.[cm]?ts$/.test(file)
  );
}

/**
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
 * @typedef {{ files: Record<string, { source?: string, mutants: ReportMutant[] }> }} Report
 */

/**
 * Babel's string reader consumes escaped U+2028/U+2029 without advancing its line. Find those
 * escapes only inside string/template tokens; backslashes in comments don't escape a break.
 * TypeScript is already used for directive comments and loads here only for this rare input.
 *
 * @param {string} source
 * @returns {Set<number>}
 */
function escapedSeparators(source) {
  const escaped = new Set();
  if (!/\\[\u2028\u2029]/.test(source)) return escaped;
  /** @type {typeof import('typescript')} */
  const ts = createRequire(import.meta.url)('typescript');
  const file = ts.createSourceFile('source.ts', source, ts.ScriptTarget.Latest, true);
  /** @type {import('typescript').Node[]} */
  const stack = [file];
  for (let node = stack.pop(); node; node = stack.pop()) {
    if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) {
      for (let at = node.getStart(file); at < node.end; at++) {
        if (source[at] !== '\\') continue;
        at++;
        if (source[at] === '\u2028' || source[at] === '\u2029') escaped.add(at);
      }
    } else {
      ts.forEachChild(node, child => {
        stack.push(child);
      });
    }
  }
  return escaped;
}

/**
 * Maps Stryker's one-based Babel positions to git's one-based LF-only positions. CRLF is one
 * line break in both systems. A lone CR or unescaped Unicode separator starts only a Babel
 * line; escaped Unicode separators in literals start neither. Each Babel
 * line start records its git line and column offset. Columns count UTF-16 units, as Babel does.
 * One scan per file keeps mapping many mutants linear in the source size plus mutant count.
 *
 * @param {string} source
 * @returns {(point: { line: number, column: number }) => { line: number, column: number }}
 */
function gitPositions(source) {
  const escaped = escapedSeparators(source);
  const starts = [{ line: 1, column: 0 }];
  let line = 1;
  let gitStart = 0;
  for (const match of source.matchAll(/\r\n|[\r\n\u2028\u2029]/g)) {
    if (escaped.has(match.index)) continue;
    const at = match.index + match[0].length;
    if (match[0].endsWith('\n')) {
      line++;
      gitStart = at;
    }
    starts.push({ line, column: at - gitStart });
  }
  return point => {
    const start = starts[point.line - 1];
    // Older callers can omit source; keep their existing coordinates in that case.
    return start ? { line: start.line, column: start.column + point.column } : point;
  };
}

/**
 * Returns each mutant in the report whose code overlaps a changed line, with its file and git
 * coordinates. Stryker mutates whole files, so a mutant whose code spans more lines than the
 * change, such as an operator in a multi-line expression, still counts. Keep the original
 * report's parser coordinates intact for incremental reuse and shard identities.
 *
 * @param {Report} report
 * @param {Map<string, Array<[number, number]>>} changed
 * @returns {Array<{ file: string, mutant: ReportMutant }>}
 */
function changedMutants(report, changed) {
  return Object.entries(report.files).flatMap(([file, { source = '', mutants }]) => {
    const ranges = changed.get(file) ?? [];
    if (ranges.length === 0) return [];
    const position = gitPositions(source);
    return mutants.flatMap(mutant => {
      const location = {
        start: position(mutant.location.start),
        end: position(mutant.location.end),
      };
      return ranges.some(([from, to]) => location.start.line <= to && location.end.line >= from)
        ? [{ file, mutant: { ...mutant, location } }]
        : [];
    });
  });
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
 * Returns each comment in `source`: the offset where its text starts, or of its "Stryker" when it
 * has one, and its text. The text has no `//`, or `/*` and `*\/`, as Babel gives it to Stryker.
 * The TypeScript parser finds the comments, so a `/*` or `//` inside a string, a template literal
 * or a regex literal isn't one. TypeScript puts a comment on its own line before the next token,
 * and a comment after code after the token before it. So the walk reads the comments before and
 * after each token. It keeps its own stack, so a long expression or a long list doesn't overflow
 * the call stack. The nodes of a JSDoc comment start inside the comment, so the walk skips them.
 * A token whose only children are JSDoc nodes, such as the end of the file after a JSDoc, is a
 * leaf, so its comments are read. TypeScript loads only when comments or escaped Unicode
 * separators need syntax context.
 *
 * @param {string} source
 * @returns {Array<{ at: number, text: string }>}
 */
function comments(source) {
  /** @type {typeof import('typescript')} */
  const ts = createRequire(import.meta.url)('typescript');
  const file = ts.createSourceFile('source.ts', source, ts.ScriptTarget.Latest, true);
  /** @type {Map<number, import('typescript').CommentRange>} */
  const ranges = new Map();
  /** @type {import('typescript').Node[]} */
  const stack = [file];
  for (let node = stack.pop(); node; node = stack.pop()) {
    const children = node.getChildren(file).filter(child => child.kind !== ts.SyntaxKind.JSDoc);
    for (const child of children) stack.push(child);
    if (children.length > 0) continue;
    for (const range of [
      ...(ts.getLeadingCommentRanges(source, node.pos) ?? []),
      ...(ts.getTrailingCommentRanges(source, node.end) ?? []),
    ]) {
      ranges.set(range.pos, range);
    }
  }
  return [...ranges.values()].map(({ pos, end, kind }) => {
    const text = source.slice(
      pos + 2,
      kind === ts.SyntaxKind.MultiLineCommentTrivia && source.endsWith('*/', end) ? end - 2 : end
    );
    return { at: pos + 2 + Math.max(text.indexOf('Stryker'), 0), text };
  });
}

/**
 * Returns the changed lines of `source` that hold a Stryker disable directive without a reason. A
 * directive can ignore mutants on lines that didn't change, such as the line after a
 * `disable next-line`, so the check reads the directive itself.
 *
 * @param {string} source
 * @param {Array<[number, number]>} ranges
 * @returns {number[]}
 */
export function reasonlessDirectives(source, ranges) {
  return directiveLines(source, ranges).lines;
}

/**
 * Returns what `reasonlessDirectives` returns, and `parsed`. That is false only when the parser
 * overflowed, so the check couldn't read the comments. The check matches each comment's text with
 * Stryker's pattern. A block comment can span lines. A
 * directive must start the text, after at most one space or line break. So a block comment's
 * closing `*\/` isn't a reason, and another directive on the same line doesn't give it one. The
 * line of a directive is the line of its "Stryker". It counts lines only at "\n", as git counts the
 * changed lines. Stryker reads only the comments before code. So this check also flags a directive
 * with no code after it, which fails safe.
 *
 * @param {string} source
 * @param {Array<[number, number]>} ranges
 * @returns {{ lines: number[], parsed: boolean }}
 */
export function directiveLines(source, ranges) {
  const changed = (/** @type {number} */ line) =>
    ranges.some(([from, to]) => line >= from && line <= to);
  const sourceLines = source.split('\n');
  // A directive's line holds its "Stryker". So with no "Stryker" on a changed line, there is
  // nothing to report, and the file needn't be parsed.
  if (!sourceLines.some((text, index) => changed(index + 1) && text.includes('Stryker'))) {
    return { lines: [], parsed: true };
  }
  /** @type {Array<{ at: number, text: string }>} */
  let found;
  try {
    found = comments(source);
  } catch (error) {
    // The parser recurses, so code nested thousands of levels deep overflows its stack. The check
    // can't then read the comments, so it fails safe: it flags each changed line that holds
    // "Stryker disable", even one with a reason.
    if (!(error instanceof RangeError)) throw error;
    return {
      lines: sourceLines.flatMap((text, index) =>
        changed(index + 1) && text.includes('Stryker disable') ? [index + 1] : []
      ),
      parsed: false,
    };
  }
  const offsets = found
    .filter(({ text }) => {
      const directive = DIRECTIVE.exec(text);
      return directive !== null && !directive[1]?.trim();
    })
    .map(({ at }) => at)
    .sort((a, b) => a - b);
  // Git, which gives the changed lines, breaks lines only at "\n". TypeScript's line numbers also
  // break at a lone "\r", U+2028 and U+2029 (AFA-115). One pass counts the "\n" before each
  // directive, so many directives in a long file don't make the check slow.
  /** @type {Set<number>} */
  const lines = new Set();
  let line = 1;
  let next = source.indexOf('\n');
  for (const at of offsets) {
    for (; next !== -1 && next < at; next = source.indexOf('\n', next + 1)) line++;
    if (changed(line)) lines.add(line);
  }
  return { lines: [...lines].sort((a, b) => a - b), parsed: true };
}
