// Fails when a mutant on a line that a pull request adds or changes under src/ survives, or when
// no test covers it. Run it from the repository root on a pull request merge commit, where
// HEAD^1 is the base branch. To check other commits, pass `--base <rev>`. Used by
// .github/workflows/ci.yml.
//
// A mutant that can't change behavior can be marked with a comment on the line above it:
//   // Stryker disable next-line <mutator>: <why behavior can't change>
// Stryker then gives it the status Ignored, so this check doesn't count it. The reason is required.

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  hunkRanges,
  isSourceFile,
  revisions,
  unexplainedIgnores,
  unkilledMutants,
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

// Fixed options, so the user's git settings can't change the output.
const gitDiff = ['diff', '--no-color', '--no-ext-diff', '--no-renames'];
const range = revisions(base, { fromMergeBase: baseFlag >= 0 });

// File names come NUL-separated and unquoted, so any file name works.
const files = execFileSync(
  'git',
  [...gitDiff, '--name-only', '-z', '--diff-filter=d', ...range, '--', 'src/'],
  { encoding: 'utf8' }
)
  .split('\0')
  .filter(file => file !== '' && isSourceFile(file));
/** @type {Map<string, Array<[number, number]>>} */
const changed = new Map();
for (const file of files) {
  const diff = execFileSync('git', [...gitDiff, '--unified=0', ...range, '--', file], {
    encoding: 'utf8',
  });
  const ranges = hunkRanges(diff);
  if (ranges.length > 0) changed.set(file, ranges);
}
if (changed.size === 0) {
  console.log(`No lines under src/ change between ${base} and HEAD, so there is nothing to check.`);
  process.exit(0);
}
const lines = [...changed].flatMap(([file, ranges]) =>
  ranges.map(([from, to]) => `  ${file}:${from}${from === to ? '' : `-${to}`}`)
);
console.log(`Changed lines:\n${lines.join('\n')}`);

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
    mutate: [...changed.keys()],
    // Run every test, so a changed file that no test imports gives NoCoverage mutants, not a
    // Stryker error.
    vitest: { ...config.vitest, related: false },
    reporters: ['clear-text', 'json'],
    jsonReporter: { fileName: report },
    thresholds: { ...config.thresholds, break: null },
  })
);

// Run Stryker with this script's Node binary, not the node_modules/.bin shim.
const stryker = spawnSync(
  process.execPath,
  ['node_modules/@stryker-mutator/core/bin/stryker.js', 'run', configFile],
  { stdio: 'inherit' }
);
if (stryker.error) throw stryker.error;
if (stryker.status !== 0) {
  console.error(`::error::Stryker exited with status ${stryker.status}.`);
  process.exit(1);
}

const results = JSON.parse(readFileSync(report, 'utf8'));
const unkilled = unkilledMutants(results, changed);
const unexplained = unexplainedIgnores(results, changed);
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
if (unexplained.length > 0) {
  console.error(`${unexplained.length} ignored mutant(s) on changed lines have no reason.`);
}
if (unkilled.length > 0 || unexplained.length > 0) process.exit(1);
console.log('Tests kill every mutant on the changed lines.');
