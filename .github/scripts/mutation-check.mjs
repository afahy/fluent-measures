// Fails when a mutant on a line that a pull request adds or changes under src/ survives, or when
// no test covers it. Run it from the repository root on a pull request merge commit, where
// HEAD^1 is the base branch. To check other commits, pass `--base <rev>`. Read the full run
// with `--report <path>` (default: reports/mutation/mutation.json). Used by .github/workflows/ci.yml.
//
// A mutant that can't change behavior can be marked with a comment on the line above it:
//   // Stryker disable next-line <mutator>: <why behavior can't change>
// Stryker then gives it the status Ignored, so this check doesn't count it. The reason is required.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import {
  backslashPaths,
  controlPaths,
  decodeNames,
  gitEnvironment,
  hunkRanges,
  isSourceFile,
  isUnmutatedCode,
  directiveLines,
  revisions,
  unexplainedIgnores,
  unkilledMutants,
} from './changed-lines.mjs';
import { escapeData, escapeProperty } from './workflow-commands.mjs';

const args = process.argv.slice(2);
const flags = new Map();
for (let i = 0; i < args.length; i += 2) {
  const value = args[i + 1];
  if (
    !['--base', '--report', '--prepare'].includes(args[i]) ||
    flags.has(args[i]) ||
    value === undefined ||
    value.startsWith('-')
  ) {
    console.error(
      'Usage: node .github/scripts/mutation-check.mjs [--base <rev>] [--report <path> | --prepare <incremental-report>]'
    );
    process.exit(2);
  }
  flags.set(args[i], value);
}
if (flags.has('--report') && flags.has('--prepare')) {
  console.error('Use either --report or --prepare, not both.');
  process.exit(2);
}
const baseFlag = flags.has('--base') ? 0 : -1;
const base = flags.get('--base') ?? 'HEAD^1';
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
const unreadable = invalid.filter(file => isSourceFile(file) || isUnmutatedCode(file));
for (const name of unreadable) {
  console.error(
    `::error::Rename ${escapeData(JSON.stringify(name))}. Its name isn't valid UTF-8, so this check can't read the file.`
  );
}
if (unreadable.length > 0) process.exit(1);
// Before the single Stryker run, discard cached results for every changed source file.
// Stryker compares mutant spans, so an edit elsewhere on the same line can otherwise reuse one.
// Remove whole files instead of translating git's lines into Stryker's parser coordinates.
const prepare = flags.get('--prepare');
if (prepare !== undefined) {
  if (existsSync(prepare)) {
    const cached = JSON.parse(readFileSync(prepare, 'utf8'));
    for (const file of names.filter(isSourceFile)) {
      if (Object.hasOwn(cached.files, file)) {
        console.log(`Removed cached mutant results for ${escapeData(JSON.stringify(file))}.`);
      }
      delete cached.files[file];
    }
    writeFileSync(prepare, JSON.stringify(cached));
  }
  console.log('Changed source files will have fresh mutation results.');
  process.exit(0);
}

const report = flags.get('--report') ?? 'reports/mutation/mutation.json';
let results;
try {
  results = JSON.parse(readFileSync(report, 'utf8'));
  if (!results.files || !results.filesRead) throw new Error('Missing files or filesRead');
} catch (error) {
  console.error(
    `::error::Cannot read the mutation report ${escapeData(JSON.stringify(report))}. Run pnpm test:mutation with the project config first. ${escapeData(error.message)}`
  );
  process.exit(1);
}
// Source tests are the only source files that the project deliberately excludes. Other unread
// or unselected source files fail, including when a broken glob selects no files for mutation.
const sourceTest = file => /\.(?:test|spec)\.[^./]+$/.test(file);
const included = file => !sourceTest(file) || results.filesRead[file] !== false;
// Git stores a symbolic link with mode 120000 and diffs only the path that it holds, but Stryker
// mutates the files that the link points to. So the changed lines and the mutants' lines don't
// match. Git's mode counts, not the checkout, which may hold a plain file. Stryker's patterns
// follow a link to a folder, so such a link always counts. A link to a file counts where the file
// would.
const changedNames = new Set(names);
const linked = execFileSync('git', ['ls-tree', '-r', '-z', 'HEAD', '--', 'src/'], gitOptions)
  .toString('utf8')
  .split('\0')
  .map(entry => /^120000 blob \w+\t(.*)$/s.exec(entry)?.[1])
  .filter(file => file !== undefined && changedNames.has(file))
  .filter(
    file =>
      statSync(file, { throwIfNoEntry: false })?.isDirectory() ||
      (isSourceFile(file) && included(file)) ||
      (isUnmutatedCode(file) && !sourceTest(file))
  );
for (const file of linked) {
  console.error(
    `::error file=${escapeProperty(file)}::Replace ${escapeData(file)} with the file or folder that it links to. It's a symbolic link, and Stryker mutates what it points to, so this check can't match its changed lines.`
  );
}
if (linked.length > 0) process.exit(1);
/** @param {string} file */
const changedRanges = file =>
  hunkRanges(
    execFileSync('git', [...gitDiff, '--unified=0', ...range, '--', `:(literal)${file}`], {
      ...gitOptions,
      encoding: 'utf8',
    })
  );
// The project mutates .ts source files. Other code extensions would pass without a check.
// Source tests are outside this scope, whatever their extension.
const unmutated = names
  .filter(isUnmutatedCode)
  .filter(file => !sourceTest(file))
  .filter(file => changedRanges(file).length > 0);
for (const file of unmutated) {
  console.error(
    `::error file=${escapeProperty(file)}::Use a .ts file in place of ${escapeData(file)}. The project mutates only .ts files, so it can't find the file's mutants.`
  );
}
if (unmutated.length > 0) process.exit(1);
/** @type {Map<string, Array<[number, number]>>} */
const changed = new Map();
for (const file of names.filter(isSourceFile).filter(included)) {
  const ranges = changedRanges(file);
  if (ranges.length > 0) changed.set(file, ranges);
}
if (changed.size === 0) {
  console.log(
    names.length + invalid.length > 0
      ? 'No added or changed line under src/ is in a file that Stryker mutates, so there is nothing to check.'
      : `No lines under src/ change between ${base} and HEAD, so there is nothing to check.`
  );
  process.exit(0);
}

// A control character, such as a line break, would break the lines that this check prints.
const controlled = controlPaths([...changed.keys()]);
for (const file of controlled) {
  console.error(
    `::error::Rename ${escapeData(JSON.stringify(file))}. Its path has a control character, so this check can't print its changed lines safely.`
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
    `::error file=${escapeProperty(file)}::Rename ${escapeData(file)}. Its path has a backslash, and Stryker reads a backslash as a slash, so this check can't find the file's mutants.`
  );
}
if (backslashed.length > 0) process.exit(1);

// Stryker 10 reports only files with mutants. The reporter also records its actual file
// inventory: a whole type-only file was selected (true) but has no mutants; an unread file is
// absent. A range selection cannot establish that every changed line was checked.
const missing = [...changed.keys()].filter(file => results.filesRead[file] !== true);
for (const file of missing) {
  console.error(
    Array.isArray(results.filesRead[file])
      ? `::error file=${escapeProperty(file)}::Select the whole file ${escapeData(file)} for mutation. The report covers only selected ranges, so this check can't establish that every changed line was checked.`
      : `::error file=${escapeProperty(file)}::Move ${escapeData(file)} or include it in Stryker's mutation scope. The full mutation run never read it for mutation, so this check can't find the file's mutants.`
  );
}
// A new directive can ignore a mutant on a line that didn't change, so check the directives too.
const directives = [...changed].flatMap(([file, ranges]) => {
  const { lines, parsed } = directiveLines(readFileSync(file, 'utf8'), ranges);
  return lines.map(line => ({ file, line, parsed }));
});
const unkilled = unkilledMutants(results, changed);
const unexplained = unexplainedIgnores(results, changed);
for (const mutant of unkilled) {
  const what = escapeData(`${mutant.mutator} mutant ${JSON.stringify(mutant.replacement)}`);
  const why = mutant.status === 'NoCoverage' ? 'no test covers it' : 'it survived';
  console.error(
    `::error file=${escapeProperty(mutant.file)},line=${mutant.line},col=${mutant.column}::The ${what} on a changed line isn't killed: ${why}.`
  );
}
for (const mutant of unexplained) {
  console.error(
    `::error file=${escapeProperty(mutant.file)},line=${mutant.line},col=${mutant.column}::A Stryker disable comment ignores the ${escapeData(mutant.mutator)} mutant without a reason. Add ": <why behavior can't change>" after the mutator name.`
  );
}
if (unkilled.length > 0) {
  console.error(
    `${unkilled.length} mutant(s) on changed lines aren't killed. Add or strengthen a test. If a mutant can't change behavior, add "// Stryker disable next-line <mutator>: <reason>" above its line.`
  );
}
for (const { file, line, parsed } of directives) {
  console.error(
    parsed
      ? `::error file=${escapeProperty(file)},line=${line}::This Stryker disable comment has no reason. Add ": <why behavior can't change>" after the mutator name.`
      : `::error file=${escapeProperty(file)},line=${line}::This check can't read the comments in this file, because its code is nested too deeply to parse. So it flags each changed line with "Stryker disable", even one with a reason. Nest the code less deeply.`
  );
}
if (unexplained.length + directives.length > 0) {
  console.error(
    `${unexplained.length + directives.length} Stryker disable comment(s) or ignored mutant(s) on changed lines have no reason, or are in a file that this check can't parse.`
  );
}
if (missing.length > 0 || unkilled.length > 0 || unexplained.length > 0 || directives.length > 0)
  process.exit(1);
console.log('Tests kill every mutant on the changed lines.');
