// Fails when a mutant on a line that a pull request adds or changes under src/ survives, or when
// no test covers it. Run it from the repository root on a pull request merge commit, where
// HEAD^1 is the base branch. To check other commits, pass `--base <rev>`. Used by
// .github/workflows/ci.yml.
//
// A mutant that can't change behavior can be marked with a comment on the line above it:
//   // Stryker disable next-line <mutator>: <why behavior can't change>
// Stryker then gives it the status Ignored, so this check doesn't count it. The reason is required.

import { execFileSync, spawnSync } from 'node:child_process';
import { lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
} from './changed-lines.mjs';

const baseFlag = process.argv.indexOf('--base');
const base = baseFlag >= 0 ? process.argv[baseFlag + 1] : 'HEAD^1';
if (base === undefined || base.startsWith('-')) {
  console.error('Usage: node .github/scripts/mutation-check.mjs [--base <rev>]');
  process.exit(2);
}

if (baseFlag < 0 && spawnSync('git', ['rev-parse', '--quiet', '--verify', 'HEAD^2']).status !== 0) {
  if (process.env.GITHUB_EVENT_NAME === 'pull_request') {
    console.error(
      "::error::HEAD isn't the pull request's merge commit, so HEAD^1 isn't the base branch."
    );
    process.exit(1);
  }
  console.log("HEAD isn't a pull request merge commit, so there are no changed lines to check.");
  process.exit(0);
}

// Fixed options and environment, so these can't change the output: color, external diff tools,
// textconv filters, rename detection, binary detection, and pathspec and diff variables. Each
// pathspec is literal, so `src/a\b.ts` doesn't also match `src/ab.ts`. With `--text`, a file
// with a NUL byte or a `-diff` attribute still shows its changed lines. A large diff needs a
// larger buffer than the default 1 MiB.
const gitDiff = ['diff', '--no-color', '--no-ext-diff', '--no-textconv', '--no-renames', '--text'];
const gitOptions = { env: gitEnvironment(process.env), maxBuffer: 64 * 1024 * 1024 };
const range = revisions(base, { fromMergeBase: baseFlag >= 0 });

// File names come NUL-separated and unquoted, so git prints each name as it is.
const { names, invalid } = decodeNames(
  execFileSync(
    'git',
    [...gitDiff, '--name-only', '-z', '--diff-filter=d', ...range, '--', ':(literal)src/'],
    gitOptions
  )
);
// Node opens a file by a UTF-8 name, so this check can't read a file whose name isn't UTF-8.
const unreadable = invalid.filter(isSourceFile);
for (const name of unreadable) {
  console.error(
    `::error::Rename ${JSON.stringify(name)}. Its name isn't valid UTF-8, so this check can't read the file.`
  );
}
if (unreadable.length > 0) process.exit(1);
const files = names.filter(isSourceFile);
/** @type {Map<string, Array<[number, number]>>} */
const changed = new Map();
for (const file of files) {
  const diff = execFileSync(
    'git',
    [...gitDiff, '--unified=0', ...range, '--', `:(literal)${file}`],
    { ...gitOptions, encoding: 'utf8' }
  );
  const ranges = hunkRanges(diff);
  if (ranges.length > 0) changed.set(file, ranges);
}
if (changed.size === 0) {
  console.log(`No lines under src/ change between ${base} and HEAD, so there is nothing to check.`);
  process.exit(0);
}

// A control character, such as a line break, would break the lines that this check prints and the
// lines that it reads from Stryker's log.
const controlled = controlPaths([...changed.keys()]);
for (const file of controlled) {
  console.error(
    `::error::Rename ${JSON.stringify(file)}. Its path has a control character, so this check can't read Stryker's log about it.`
  );
}
if (controlled.length > 0) process.exit(1);

const lines = [...changed].flatMap(([file, ranges]) =>
  ranges.map(([from, to]) => `  ${file}:${from}${from === to ? '' : `-${to}`}`)
);
console.log(`Changed lines:\n${lines.join('\n')}`);

// Stryker reads a backslash in a path as a slash. So this check can't find the mutants of such a
// file, and it would pass without checking the file.
const backslashed = backslashPaths([...changed.keys()]);
for (const file of backslashed) {
  console.error(
    `::error file=${file}::Rename ${file}. Its path has a backslash, and Stryker reads a backslash as a slash, so this check can't find the file's mutants.`
  );
}
if (backslashed.length > 0) process.exit(1);

// Mutate the whole of each changed file, so a mutant whose code spans more lines than the change
// is still made. Only the mutants that overlap a changed line count. Use the project's Stryker
// config with a JSON report in a temporary folder and no score threshold: this script decides
// the result from the report.
const directory = mkdtempSync(join(tmpdir(), 'fluent-measures-mutation-'));
const report = join(directory, 'mutation.json');
const { $schema: _schema, ...config } = JSON.parse(readFileSync('stryker.config.json', 'utf8'));
const configFile = join(directory, 'stryker.config.json');
writeFileSync(
  configFile,
  JSON.stringify({
    ...config,
    mutate: [...changed.keys()].map(literalGlob),
    reporters: ['clear-text', 'json'],
    jsonReporter: { fileName: report },
    thresholds: { ...config.thresholds, break: null },
    fileLogLevel: 'warn',
    // In related mode, Vitest runs only the tests that import a mutated file. A file with only
    // types, such as src/types.ts, has none at runtime, so Stryker stopped with "No tests were
    // executed". The dry run now runs every test, and each mutant still runs only the tests that
    // cover it.
    vitest: { ...config.vitest, related: false },
  })
);

// Stryker adds its warnings to stryker.log. Read only this run's lines, and remove the file if
// this run made it. A symbolic link would send the warnings to /dev/null or to another file, so
// this check couldn't read them.
const logFile = 'stryker.log';
const logBefore = lstatSync(logFile, { throwIfNoEntry: false });
if (logBefore && !logBefore.isFile()) {
  console.error(
    `::error::Remove ${logFile}, or make it a regular file. Stryker writes its warnings there, and this check reads them.`
  );
  process.exit(1);
}

// Run Stryker with this script's Node binary, not the node_modules/.bin shim.
const stryker = spawnSync(
  process.execPath,
  ['node_modules/@stryker-mutator/core/bin/stryker.js', 'run', configFile],
  { stdio: 'inherit' }
);
if (stryker.error) throw stryker.error;

// Stryker never reads some folders, such as node_modules, so it can't mutate a file in them. It
// only warns that the file's pattern matched no file, and the report then has no entry for it.
const log = lstatSync(logFile, { throwIfNoEntry: false })
  ? readFileSync(logFile)
      .subarray(logBefore?.size ?? 0)
      .toString('utf8')
  : '';
if (!logBefore) rmSync(logFile, { force: true });
const unmatched = unmatchedFiles(log, [...changed.keys()]);
for (const file of unmatched) {
  console.error(
    `::error file=${file}::Move ${file}. Stryker never reads some folders, such as node_modules, so this check can't find the file's mutants.`
  );
}
// Without the file, Stryker may find no tests to run, but the file is the problem to fix.
if (unmatched.length > 0) process.exit(1);
if (stryker.status !== 0) {
  console.error(
    `::error::Stryker exited with status ${stryker.status}. If its log says "No tests were executed", no test imports the changed files: add tests that do.`
  );
  process.exit(1);
}

const results = JSON.parse(readFileSync(report, 'utf8'));
const unkilled = unkilledMutants(results, changed);
const unexplained = unexplainedIgnores(results, changed);
// A new directive can ignore a mutant on a line that didn't change, so check the directives too.
const directives = [...changed].flatMap(([file, ranges]) =>
  reasonlessDirectives(readFileSync(file, 'utf8'), ranges).map(line => ({ file, line }))
);
for (const mutant of unkilled) {
  const what = `${mutant.mutator} mutant ${JSON.stringify(mutant.replacement)}`;
  const why = mutant.status === 'NoCoverage' ? 'no test covers it' : 'it survived';
  console.error(
    `::error file=${mutant.file},line=${mutant.line},col=${mutant.column}::The ${what} on a changed line isn't killed: ${why}.`
  );
}
for (const mutant of unexplained) {
  console.error(
    `::error file=${mutant.file},line=${mutant.line},col=${mutant.column}::A Stryker disable comment ignores the ${mutant.mutator} mutant without a reason. Add ": <why behavior can't change>" after the mutator name.`
  );
}
if (unkilled.length > 0) {
  console.error(
    `${unkilled.length} mutant(s) on changed lines aren't killed. Add or strengthen a test. If a mutant can't change behavior, add "// Stryker disable next-line <mutator>: <reason>" above its line.`
  );
}
for (const { file, line } of directives) {
  console.error(
    `::error file=${file},line=${line}::This Stryker disable comment has no reason. Add ": <why behavior can't change>" after the mutator name.`
  );
}
if (unexplained.length + directives.length > 0) {
  console.error(
    `${unexplained.length + directives.length} Stryker disable comment(s) or ignored mutant(s) on changed lines have no reason.`
  );
}
if (unkilled.length > 0 || unexplained.length > 0 || directives.length > 0) process.exit(1);
console.log('Tests kill every mutant on the changed lines.');
