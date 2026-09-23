// Checks that a fix PR adds a test that fails without the fix. It restores the base branch's
// package files, keeps the PR's tests, and runs the tests the PR adds or changes. Run it from
// the repository root on a pull request merge commit. Used by
// .github/workflows/regression-test.yml.
//
// Writes `result` to $GITHUB_OUTPUT:
//   unchanged   The PR changes only comments or formatting in the package files.
//   no-tests    The PR adds or changes no test that can run against the base branch.
//   caught      At least one of those tests fails against the base branch.
//   not-caught  All of those tests pass against the base branch.

import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import ts from 'typescript';

// HEAD is the merge of the PR into the base branch, so its first parent is the base branch.
const BASE = 'HEAD^1';
// The files a fix to the published package changes.
const PACKAGE_PATHS = ['src/', 'package.json', 'tsup.config.ts'];
// tsc errors for an import that doesn't resolve. A test file with one of these needs a module
// or export that the PR adds, so it can't show how the base branch behaves.
const IMPORT_ERRORS = new Set(['TS2305', 'TS2307', 'TS2459', 'TS2460', 'TS2614', 'TS2724']);

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).split('\n').filter(Boolean);
}

function fileAt(rev, path) {
  const show = spawnSync('git', ['show', `${rev}:${path}`], { encoding: 'utf8' });
  return show.status === 0 ? show.stdout : null;
}

// Returns the same string for two versions of a file that differ only in comments or
// formatting. For code, that is the syntax tree: node kinds plus the text of identifiers and
// literals. Comments, including JSDoc, aren't child nodes, so they don't appear in it.
function normalize(path, text) {
  if (path.endsWith('.json')) return JSON.stringify(JSON.parse(text));
  if (!/\.[cm]?[jt]sx?$/.test(path)) return text;
  const shape = node => {
    let result = `(${node.kind}`;
    if (node.kind !== ts.SyntaxKind.SourceFile && typeof node.text === 'string') {
      result += JSON.stringify(node.text);
    }
    ts.forEachChild(node, child => {
      result += shape(child);
    });
    return `${result})`;
  };
  return shape(ts.createSourceFile(path, text, ts.ScriptTarget.Latest));
}

function run(script, args, options) {
  // process.execPath, not the node_modules/.bin shims, so the tools use this script's Node.
  const result = spawnSync(process.execPath, [script, ...args], options);
  if (result.error) throw result.error;
  return result;
}

function setResult(result) {
  console.log(`Result: ${result}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `result=${result}\n`);
}

console.log(`Node ${process.version}`);

const packageFiles = git(
  'diff',
  '--name-only',
  '--no-renames',
  BASE,
  'HEAD',
  '--',
  ...PACKAGE_PATHS
);
const fixed = packageFiles.filter(path => {
  const before = fileAt(BASE, path);
  const after = fileAt('HEAD', path);
  return before === null || after === null || normalize(path, before) !== normalize(path, after);
});
if (fixed.length === 0) {
  console.log('This PR changes only comments or formatting in the package files.');
  setResult('unchanged');
  process.exit(0);
}
console.log(`This PR changes:\n${fixed.map(path => `  ${path}`).join('\n')}`);

const testPaths = git(
  'diff',
  '--name-only',
  '--no-renames',
  '--diff-filter=AM',
  BASE,
  'HEAD',
  '--',
  'tests/'
);
if (testPaths.length === 0) {
  console.log("This PR doesn't add or change anything under tests/.");
  setResult('no-tests');
  process.exit(0);
}

// Keep the PR's tests but restore the base branch's package files. --no-overlay also deletes
// files that the PR adds.
execFileSync('git', ['checkout', '--no-overlay', BASE, '--', ...packageFiles]);

// tsconfig.json includes tests/, so a type-level regression test fails here, not in Vitest.
const tsc = run('node_modules/typescript/bin/tsc', ['--noEmit', '--pretty', 'false'], {
  encoding: 'utf8',
});
if (tsc.status !== 0 && !/^\S+\(\d+,\d+\): error TS\d+/m.test(tsc.stdout)) {
  throw new Error(`tsc exited with status ${tsc.status}:\n${tsc.stdout}${tsc.stderr}`);
}
const typeErrors = [
  ...tsc.stdout.matchAll(/^(tests\/.+?)\((\d+),\d+\): error (TS\d+): (.*)$/gm),
].map(([, file, line, code, message]) => ({ file, line, code, message }));
const unloadable = new Set(typeErrors.filter(e => IMPORT_ERRORS.has(e.code)).map(e => e.file));

// `vitest related` runs the changed test files and the test files that import changed helpers.
// The default reporter replaces Vitest's GitHub Actions reporter, which would annotate the PR
// with the failures this check expects.
const loadablePaths = testPaths.filter(path => !unloadable.has(path));
const report = join(mkdtempSync(join(tmpdir(), 'regression-check-')), 'vitest.json');
if (loadablePaths.length > 0) {
  const vitest = run(
    'node_modules/vitest/vitest.mjs',
    [
      'related',
      '--run',
      '--passWithNoTests',
      '--reporter=default',
      '--reporter=json',
      `--outputFile.json=${report}`,
      ...[...unloadable].map(path => `--exclude=${path}`),
      ...loadablePaths,
    ],
    { stdio: 'inherit' }
  );
  if (![0, 1].includes(vitest.status) || !existsSync(report)) {
    throw new Error(`Vitest exited with status ${vitest.status} and no test report.`);
  }
}

const ran = new Set();
const caught = [];
const results = existsSync(report) ? JSON.parse(readFileSync(report, 'utf8')).testResults : [];
for (const file of results) {
  const path = relative(process.cwd(), file.name);
  if (file.status === 'failed' && file.assertionResults.length === 0) {
    // The file failed to load, for example because it imports a file that the PR adds.
    unloadable.add(path);
    continue;
  }
  ran.add(path);
  for (const test of file.assertionResults) {
    if (test.status === 'failed') caught.push(`${path} > ${test.fullName}`);
  }
}
for (const { file, line, code, message } of typeErrors) {
  if (
    !IMPORT_ERRORS.has(code) &&
    !unloadable.has(file) &&
    (ran.has(file) || testPaths.includes(file))
  ) {
    caught.push(`${file}:${line} ${code} ${message}`);
  }
}

if (caught.length > 0) {
  console.log(`These fail against the base branch:\n${caught.map(item => `  ${item}`).join('\n')}`);
  setResult('caught');
} else {
  for (const path of unloadable) {
    console.log(
      `::notice::${path} doesn't load against the base branch because it imports a module or export that this PR adds, so its tests don't count. Put the regression test in a file that loads on the base branch.`
    );
  }
  setResult(ran.size > 0 ? 'not-caught' : 'no-tests');
}
