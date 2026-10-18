// Summarizes what a pull request changes in parseMeasurement's results, and rates its risk, so
// that the maintainer can judge the PR from its evidence. Run it from the repository root on a
// pull request merge commit. Used by .github/workflows/evidence.yml.
//
// Reads these environment variables:
//   PR_BODY    The PR's description.
//   SIZE_BASE  Optional. A file with `size-limit --json` output for the base branch.
//   SIZE_HEAD  Optional. The same for the PR.
//
// Writes the summary to $GITHUB_STEP_SUMMARY. Fails when results change and the PR body has no
// "Changed results" list.

import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { escapeData } from './workflow-commands.mjs';

// HEAD is the merge of the PR into the base branch, so its first parent is the base branch.
const BASE = 'HEAD^1';
const RESULTS = 'tests/__snapshots__/resultSnapshot.txt';
const CORPUS = 'tests/corpus/measurements.jsonl';
const CORPUS_REPORT = 'tests/__snapshots__/corpus.test.ts.snap';
const EXAMPLES = ['README.md', 'PARSING.md'];
const API_REPORT = 'api-report.d.ts';
// The package.json fields that reach a user of the package.
const CONSUMER_FIELDS = [
  'name',
  'version',
  'type',
  'main',
  'module',
  'types',
  'exports',
  'imports',
  'files',
  'sideEffects',
  'bin',
  'browser',
  'engines',
  'publishConfig',
  'dependencies',
  'peerDependencies',
  'optionalDependencies',
  'bundleDependencies',
];
// The largest raise of a size budget that AGENTS.md lets an agent make, in kB.
const SIZE_RAISE = 0.5;
// The most results that the summary lists in each table.
const LIST_LIMIT = 100;
// The largest output that the script reads from git, in bytes.
const BUFFER = 256 * 1024 * 1024;

/**
 * Reads the result snapshot: one line for each input and option set, with the result.
 *
 * @param {string | null} text
 * @returns {Map<string, string>} The result for each input and option set, joined by a tab.
 */
export function parseResults(text) {
  /** @type {Map<string, string>} */
  const results = new Map();
  for (const line of (text ?? '').split('\n')) {
    const fields = line.split('\t');
    if (fields.length < 3) continue;
    results.set(`${fields[0]}\t${fields[1]}`, fields.slice(2).join('\t'));
  }
  return results;
}

/**
 * The results that changed between two result snapshots. An input that only one of them has is a
 * change to the generated inputs, not to a result.
 *
 * @param {Map<string, string>} base
 * @param {Map<string, string>} head
 * @returns {import('./evidence.d.mts').ResultChanges}
 */
export function resultChanges(base, head) {
  /** @type {import('./evidence.d.mts').ResultChange[]} */
  const changed = [];
  for (const [key, before] of base) {
    const after = head.get(key);
    if (after === undefined || after === before) continue;
    const [input, options] = key.split('\t');
    changed.push({ input, options, before, after });
  }
  const added = [...head.keys()].filter(key => !base.has(key)).length;
  const removed = [...base.keys()].filter(key => !head.has(key)).length;
  return { changed, added, removed };
}

/**
 * Reads what each corpus entry expects, by id: its input, options and expected outputs. Its
 * category, source and note don't change a result.
 *
 * @param {string | null} text
 * @returns {Map<string, string>}
 */
export function parseCorpus(text) {
  /** @type {Map<string, string>} */
  const entries = new Map();
  for (const line of (text ?? '').split('\n')) {
    if (!line.trim()) continue;
    const { id, input, options, expected } = JSON.parse(line);
    entries.set(String(id), JSON.stringify([input, options ?? null, expected]));
  }
  return entries;
}

/**
 * Reads the corpus report from its Vitest snapshot file.
 *
 * @param {string | null} text
 * @returns {import('./evidence.d.mts').CorpusReport}
 */
export function parseCorpusReport(text) {
  /** @type {import('./evidence.d.mts').CorpusReport} */
  const report = { rows: new Map(), outcomes: new Map() };
  const quoted =
    /exports\[`measurement corpus > matches the committed score 1`\] = `\n"([\s\S]*?)"\n`;/.exec(
      text ?? ''
    );
  if (!quoted) return report;
  // Vitest writes the report in a template literal, so it escapes "\", "`" and "${".
  const lines = quoted[1].replace(/\\(\\|`|\$\{)/g, '$1').split('\n');
  /** @type {string | null} */
  let section = null;
  /** @type {string | null} */
  let entry = null;
  for (const line of lines) {
    const outcome = /^Entries with the outcome "(\w+)" \(\d+\):$/.exec(line);
    if (outcome) {
      section = outcome[1];
      continue;
    }
    if (line.startsWith('Entries that agree with one of several outputs')) {
      section = 'several';
      continue;
    }
    if (section === null) {
      const row = /^(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/.exec(line);
      if (row) report.rows.set(row[1], row.slice(2).join(' '));
    } else if (section === 'several') {
      const choice = /^(\S+): (.*)$/.exec(line);
      if (choice) report.outcomes.set(choice[1], `agree: ${choice[2]}`);
    } else {
      const heading = /^(\S+) \([\w-]+\)$/.exec(line);
      if (heading) {
        entry = heading[1];
        report.outcomes.set(entry, section);
      } else if (entry && line.startsWith('  actual:')) {
        report.outcomes.set(entry, `${section}: ${line.slice('  actual:'.length).trim()}`);
      }
    }
  }
  return report;
}

/**
 * The corpus entries whose outcome changed, and the entries that the PR edits or removes. An
 * entry that the report doesn't list agrees with its one expected output.
 *
 * @param {{ entries: Map<string, string>, report: import('./evidence.d.mts').CorpusReport }} base
 * @param {{ entries: Map<string, string>, report: import('./evidence.d.mts').CorpusReport }} head
 * @returns {import('./evidence.d.mts').CorpusChanges}
 */
export function corpusChanges(base, head) {
  /** @type {import('./evidence.d.mts').CorpusChanges} */
  const changes = { outcomes: [], edited: [], removed: [], added: 0, rows: [] };
  for (const [id, entry] of base.entries) {
    const now = head.entries.get(id);
    if (now === undefined) {
      changes.removed.push(id);
      continue;
    }
    if (now !== entry) changes.edited.push(id);
    const before = base.report.outcomes.get(id) ?? 'agree';
    const after = head.report.outcomes.get(id) ?? 'agree';
    if (before !== after) changes.outcomes.push({ id, before, after });
  }
  changes.added = [...head.entries.keys()].filter(id => !base.entries.has(id)).length;
  for (const [name, after] of head.report.rows) {
    const before = base.report.rows.get(name) ?? '';
    if (before !== after) changes.rows.push({ name, before, after });
  }
  return changes;
}

/**
 * The examples in a Markdown file: each line of a fenced code block that calls parseMeasurement,
 * and each paragraph of text with a code span, such as "`12st 4lb` returns `null`". A paragraph
 * is one item with its lines joined, so new line breaks in it change no example.
 *
 * @param {string | null} markdown
 * @returns {string[]}
 */
export function exampleLines(markdown) {
  const fence = /^```[^\n]*\n([\s\S]*?)^```[^\n]*$/gm;
  const text = markdown ?? '';
  const code = [...text.matchAll(fence)]
    .map(([, block]) => block)
    .filter(block => block.includes('parseMeasurement'))
    .flatMap(block => block.split('\n'))
    .map(line => line.trimEnd())
    .filter(Boolean);
  // A heading names a section, so it isn't an example.
  const prose = text
    .replace(fence, '\n')
    .split(/\n[ \t]*\n/)
    .map(paragraph =>
      paragraph
        .split('\n')
        .filter(line => !/^#{1,6} /.test(line))
        .join(' ')
        .trim()
        .replace(/\s+/g, ' ')
    )
    .filter(paragraph => paragraph.includes('`'));
  return [...code, ...prose];
}

/**
 * The lines that one list has more often than the other.
 *
 * @param {string[]} from
 * @param {string[]} to
 * @returns {string[]}
 */
function missingFrom(from, to) {
  const left = [...to];
  return from.filter(line => {
    const at = left.indexOf(line);
    if (at < 0) return true;
    left.splice(at, 1);
    return false;
  });
}

/**
 * @param {string[]} base
 * @param {string[]} head
 * @returns {{ removed: string[], added: string[] }}
 */
export function exampleChanges(base, head) {
  return { removed: missingFrom(base, head), added: missingFrom(head, base) };
}

/**
 * The package.json fields that reach users and that differ.
 *
 * @param {string | null} base
 * @param {string | null} head
 * @returns {string[]}
 */
export function consumerFieldChanges(base, head) {
  const before = JSON.parse(base ?? '{}');
  const after = JSON.parse(head ?? '{}');
  return CONSUMER_FIELDS.filter(
    field => JSON.stringify(before[field]) !== JSON.stringify(after[field])
  );
}

/**
 * The size budget of each file in .size-limit.cjs, in kB.
 *
 * @param {string | null} text
 * @returns {Map<string, number>}
 */
export function sizeLimits(text) {
  /** @type {Map<string, number>} */
  const limits = new Map();
  for (const [entry] of (text ?? '').matchAll(/\{[^{}]*\}/g)) {
    const path = /path:\s*['"]([^'"]+)['"]/.exec(entry)?.[1];
    const limit = /limit:\s*['"](\d+(?:\.\d+)?)\s*kB['"]/.exec(entry)?.[1];
    if (path !== undefined && limit !== undefined) limits.set(path, Number(limit));
  }
  return limits;
}

/**
 * How much each budget rises, and the files whose budget the PR removes.
 *
 * @param {Map<string, number>} base
 * @param {Map<string, number>} head
 * @returns {{ raises: number[], removed: string[] }}
 */
export function sizeChanges(base, head) {
  const raises = [...head].map(([path, limit]) => limit - (base.get(path) ?? limit));
  const removed = [...base.keys()].filter(path => !head.has(path));
  return { raises, removed };
}

/**
 * The coverage and mutation limits: Stryker's `break` and each coverage threshold.
 *
 * @param {string | null} stryker stryker.config.json
 * @param {string | null} vitest vitest.config.ts
 * @returns {Map<string, number>}
 */
export function testLimits(stryker, vitest) {
  /** @type {Map<string, number>} */
  const limits = new Map();
  const mutation = JSON.parse(stryker ?? '{}').thresholds?.break;
  if (typeof mutation === 'number') limits.set('mutation score', mutation);
  const thresholds = /thresholds:\s*\{([^}]*)\}/.exec(vitest ?? '')?.[1] ?? '';
  for (const [, name, value] of thresholds.matchAll(/(\w+):\s*(\d+(?:\.\d+)?)/g)) {
    limits.set(`${name} coverage`, Number(value));
  }
  return limits;
}

/**
 * The files that decide which checks run and what they count. testLimits compares the numbers
 * in the first two, so testSettings leaves those numbers out.
 */
export const SETTINGS = [
  'stryker.config.json',
  'vitest.config.ts',
  'vitest.package.config.ts',
  'package.json',
  'eslint.config.js',
  'commitlint.config.js',
  'commitlint.pr-title.config.js',
  'tsconfig.json',
];

/**
 * The test settings in a form to compare: Stryker's config without its thresholds,
 * vitest.config.ts without its coverage thresholds, only the scripts of package.json, and each
 * other file without blank space.
 *
 * @param {Record<string, string | null>} files The text of each file in SETTINGS.
 * @returns {string}
 */
export function testSettings(files) {
  const { thresholds: _, ...mutation } = JSON.parse(files['stryker.config.json'] ?? '{}');
  const { scripts } = JSON.parse(files['package.json'] ?? '{}');
  const vitest = (files['vitest.config.ts'] ?? '').replace(/thresholds:\s*\{[^}]*\}/, '');
  const others = SETTINGS.slice(2)
    .filter(path => path !== 'package.json')
    .map(path => files[path] ?? '');
  return JSON.stringify([
    mutation,
    scripts ?? {},
    ...[vitest, ...others].map(t => t.replace(/\s+/g, '')),
  ]);
}

/**
 * How many `expect` calls a diff of the tests removes, less the ones that it adds.
 *
 * @param {string} diff `git diff` output.
 * @returns {number}
 */
export function removedExpects(diff) {
  let count = 0;
  for (const line of diff.split('\n')) {
    if (/^[-+](?![-+]{2} )/.test(line) && /\bexpect(?:TypeOf)?\(/.test(line)) {
      count += line.startsWith('-') ? 1 : -1;
    }
  }
  return Math.max(count, 0);
}

/**
 * The lines that a diff adds and that turn off a mutation or coverage check.
 *
 * @param {string} diff `git diff` output.
 * @returns {string[]}
 */
export function addedIgnores(diff) {
  return diff
    .split('\n')
    .filter(line => line.startsWith('+') && !line.startsWith('+++'))
    .filter(line => /Stryker disable|[cv]8 ignore|istanbul ignore/.test(line))
    .map(line => line.slice(1).trim());
}

/**
 * The scripts that a set of workflows run: each .github/scripts file that a workflow names, and
 * each script that those import, as far as the imports go.
 *
 * @param {string[]} workflows The workflows' text.
 * @param {(path: string) => string | null} read
 * @returns {Set<string>}
 */
export function scriptsRun(workflows, read) {
  const found = new Set(
    workflows.flatMap(text =>
      [...text.matchAll(/\.github\/scripts\/[\w.-]+\.mjs/g)].map(([p]) => p)
    )
  );
  const queue = [...found];
  while (queue.length > 0) {
    const script = /** @type {string} */ (queue.pop());
    for (const [, name] of (read(script) ?? '').matchAll(/from '\.\/([\w.-]+\.mjs)'/g)) {
      const path = `.github/scripts/${name}`;
      if (!found.has(path)) {
        found.add(path);
        queue.push(path);
      }
    }
  }
  return found;
}

/**
 * Whether the PR body lists the changed results, under a heading or a line that starts with
 * "Changed results".
 *
 * @param {string} body
 * @returns {boolean}
 */
export function listsChangedResults(body) {
  return /^[ \t]*(?:#{1,6}[ \t]*)?(?:\*\*)?Changed results\b/im.test(body);
}

/**
 * Rates the PR for the maintainer's review. A high risk is a change that the maintainer decides
 * on. A medium risk changes code that runs, or a result. A low risk changes neither.
 *
 * @param {import('./evidence.d.mts').Facts} facts
 * @returns {{ level: 'low' | 'medium' | 'high', reasons: string[] }}
 */
export function assessRisk(facts) {
  const high = [];
  const medium = [];
  if (facts.examples.removed.length + facts.examples.added.length > 0) {
    high.push('It changes an example in README.md or PARSING.md, the public specification.');
  }
  if (facts.apiChanged) high.push(`It changes an exported type (${API_REPORT}).`);
  if (facts.consumerFields.length > 0) {
    high.push(
      `It changes package.json fields that reach users: ${facts.consumerFields.join(', ')}.`
    );
  }
  if (facts.corpus.edited.length + facts.corpus.removed.length > 0) {
    high.push('It edits or removes a corpus entry, which changes an expected output.');
  }
  if (facts.deletedTests.length > 0)
    high.push(`It deletes tests: ${facts.deletedTests.join(', ')}.`);
  if (facts.loweredLimits.length > 0) {
    high.push(`It lowers a test limit: ${facts.loweredLimits.join(', ')}.`);
  }
  if (facts.settingsChanged) {
    high.push('It changes which tests run, or what coverage or mutation testing counts.');
  }
  if (facts.ciChanged.length > 0) {
    high.push(
      `It changes CI, a workflow or a script that a workflow runs: ${facts.ciChanged.join(', ')}.`
    );
  }
  if (facts.removedBudgets.length > 0) {
    high.push(`It removes a size budget: ${facts.removedBudgets.join(', ')}.`);
  }
  const raises = facts.sizeRaises.filter(raise => raise > 0);
  if (raises.some(raise => raise > SIZE_RAISE + 1e-9)) {
    high.push(`It raises a size budget by more than ${SIZE_RAISE} kB.`);
  } else if (raises.length > 0) {
    medium.push(`It raises a size budget by ${Math.max(...raises)} kB.`);
  }
  if (facts.removedExpects > 0) {
    medium.push(`It removes ${facts.removedExpects} expect calls from the tests.`);
  }
  if (facts.ignores.length > 0) {
    medium.push(
      `It adds ${facts.ignores.length} comments that turn off a mutation or coverage check.`
    );
  }
  const results = facts.results.changed.length + facts.corpus.outcomes.length;
  if (results > 0) medium.push(`It changes ${results} results.`);
  if (facts.codeChanged.length > 0) {
    medium.push(`It changes code that runs: ${facts.codeChanged.join(', ')}.`);
  }
  if (high.length > 0) return { level: 'high', reasons: high };
  if (medium.length > 0) return { level: 'medium', reasons: medium };
  return { level: 'low', reasons: ['It changes no code that runs and no result.'] };
}

/**
 * Text for a Markdown table cell.
 *
 * @param {string} text
 * @returns {string}
 */
function code(text) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\|/g, '&#124;');
  return `<code>${escaped}</code>`;
}

/**
 * @template T
 * @param {T[]} items
 * @param {(item: T) => string} row
 * @returns {string[]}
 */
function limited(items, row) {
  const rows = items.slice(0, LIST_LIMIT).map(row);
  if (items.length > LIST_LIMIT)
    rows.push(`\nThe summary leaves out ${items.length - LIST_LIMIT} more.`);
  return rows;
}

/**
 * The Markdown summary for the job.
 *
 * @param {import('./evidence.d.mts').Facts} facts
 * @param {{ level: string, reasons: string[] }} risk
 * @returns {string}
 */
export function summary(facts, risk) {
  const lines = ['## Evidence', '', `Risk: **${risk.level}**`, ''];
  lines.push(...risk.reasons.map(reason => `- ${reason}`), '');

  lines.push('### Results', '');
  const { changed, added, removed } = facts.results;
  if (changed.length === 0) {
    lines.push(`No result in \`${RESULTS}\` changed.`);
  } else {
    lines.push(`${changed.length} results in \`${RESULTS}\` changed:`, '');
    lines.push('| Input | Options | main | This PR |', '| --- | --- | --- | --- |');
    lines.push(
      ...limited(
        changed,
        ({ input, options, before, after }) =>
          `| ${code(input)} | ${code(options)} | ${code(before)} | ${code(after)} |`
      )
    );
  }
  if (added + removed > 0) {
    lines.push('', `The generated inputs changed: ${added} added and ${removed} removed.`);
  }
  if (facts.snapshotTestChanged) {
    lines.push(
      '',
      'The PR changes `tests/resultSnapshot.test.ts`, so a changed line can come from a change to ' +
        "the snapshot's inputs or format, not to a result."
    );
  }

  lines.push('', '### Corpus', '');
  const { corpus } = facts;
  if (corpus.rows.length > 0) {
    lines.push('| Category | main | This PR |', '| --- | --- | --- |');
    lines.push('| | total agree wrong missed throws | total agree wrong missed throws |');
    lines.push(
      ...corpus.rows.map(({ name, before, after }) => `| ${name} | ${before} | ${after} |`)
    );
    lines.push('');
  }
  if (corpus.outcomes.length > 0) {
    lines.push('| Entry | main | This PR |', '| --- | --- | --- |');
    lines.push(
      ...limited(
        corpus.outcomes,
        ({ id, before, after }) => `| ${code(id)} | ${code(before)} | ${code(after)} |`
      ),
      ''
    );
  }
  lines.push(`New entries: ${corpus.added}.`);
  if (corpus.edited.length > 0)
    lines.push(`Edited entries: ${corpus.edited.map(code).join(', ')}.`);
  if (corpus.removed.length > 0) {
    lines.push(`Removed entries: ${corpus.removed.map(code).join(', ')}.`);
  }

  lines.push('', '### Examples in README.md and PARSING.md', '');
  const { examples } = facts;
  if (examples.removed.length + examples.added.length === 0) {
    lines.push('No example changed.');
  } else {
    lines.push('```diff');
    const diff = [
      ...examples.removed.map(line => `- ${line}`),
      ...examples.added.map(line => `+ ${line}`),
    ];
    lines.push(...diff.slice(0, LIST_LIMIT), '```');
    if (diff.length > LIST_LIMIT)
      lines.push(`The summary leaves out ${diff.length - LIST_LIMIT} more lines.`);
  }

  lines.push('', '### Exported types', '');
  lines.push(facts.apiChanged ? `\`${API_REPORT}\` changed.` : `\`${API_REPORT}\` didn't change.`);

  lines.push('', '### Bundle size', '');
  if (facts.sizes.length === 0) {
    lines.push(
      facts.packageChanged
        ? 'The sizes are missing. The step that measures them says why.'
        : "The PR doesn't change the package files, so the sizes didn't change."
    );
  } else {
    lines.push('| File | main | This PR | Change |', '| --- | --- | --- | --- |');
    lines.push(
      ...facts.sizes.map(({ name, before, after }) => {
        const change =
          before === null ? '' : `${after - before >= 0 ? '+' : ''}${after - before} B`;
        return `| ${code(name)} | ${before === null ? '' : `${before} B`} | ${after} B | ${change} |`;
      })
    );
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Reads `size-limit --json` output. A build that failed leaves no output, or output that isn't
 * JSON, and the CI job reports that failure.
 *
 * @param {string | null} text
 * @returns {{ name: string, size: number }[]}
 */
function sizeList(text) {
  try {
    const list = JSON.parse(text ?? '');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/**
 * Pairs each build's size on the base branch with its size in the PR.
 *
 * @param {string | null} base `size-limit --json` output.
 * @param {string | null} head
 * @returns {import('./evidence.d.mts').Size[]}
 */
export function sizes(base, head) {
  const before = sizeList(base);
  return sizeList(head).map(({ name, size }) => ({
    name,
    before: before.find(entry => entry.name === name)?.size ?? null,
    after: size,
  }));
}

/**
 * @param {string} rev
 * @param {string} path
 * @returns {string | null}
 */
function fileAt(rev, path) {
  const show = spawnSync('git', ['show', `${rev}:${path}`], {
    encoding: 'utf8',
    maxBuffer: BUFFER,
  });
  if (show.error) throw show.error;
  return show.status === 0 ? show.stdout : null;
}

/**
 * @param {...string} args
 * @returns {string}
 */
function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: BUFFER });
}

/**
 * @param {string | undefined} path
 * @returns {string | null}
 */
function readOptional(path) {
  return path && existsSync(path) ? readFileSync(path, 'utf8') : null;
}

/**
 * Reads `git diff --name-status -z` output: a status, then one path, or two for a rename or a
 * copy. A renamed file gives both paths with the kind "R", so a moved test isn't a deleted one.
 *
 * @param {string} output
 * @returns {{ kind: string, path: string }[]}
 */
export function nameStatus(output) {
  const fields = output.split('\0');
  /** @type {{ kind: string, path: string, to?: string }[]} */
  const list = [];
  for (let at = 0; at < fields.length && fields[at]; ) {
    const kind = fields[at][0];
    if (kind === 'R' || kind === 'C') {
      const [from, to] = fields.slice(at + 1, at + 3);
      list.push({ kind, path: from, to }, { kind, path: to });
      at += 3;
    } else {
      list.push({ kind, path: fields[at + 1] });
      at += 2;
    }
  }
  return list;
}

const TEST_FILE = /^tests\/.*\.test\.[cm]?[jt]sx?$/;

/**
 * The test files that a PR deletes, or renames to a name that Vitest doesn't run.
 *
 * @param {{ kind: string, path: string, to?: string }[]} status
 * @returns {string[]}
 */
export function deletedTests(status) {
  return status
    .filter(({ kind, path, to }) => {
      if (!TEST_FILE.test(path)) return false;
      return kind === 'D' || (kind === 'R' && to !== undefined && !TEST_FILE.test(to));
    })
    .map(({ path, to }) => (to === undefined ? path : `${path} (renamed to ${to})`));
}

/**
 * Collects the facts from the merge commit.
 *
 * @returns {import('./evidence.d.mts').Facts}
 */
function collect() {
  const both = (/** @type {string} */ path) => [fileAt(BASE, path), fileAt('HEAD', path)];
  const status = nameStatus(git('diff', '--name-status', '--find-renames', '-z', BASE, 'HEAD'));
  const paths = [...new Set(status.map(({ path }) => path))];

  const [baseResults, headResults] = both(RESULTS);
  const [baseCorpus, headCorpus] = both(CORPUS);
  const [baseReport, headReport] = both(CORPUS_REPORT);
  const examples = EXAMPLES.map(path => both(path).map(exampleLines));
  const [baseLimits, headLimits] = [BASE, 'HEAD'].map(rev =>
    testLimits(fileAt(rev, 'stryker.config.json'), fileAt(rev, 'vitest.config.ts'))
  );
  const [baseSize, headSize] = both('.size-limit.cjs').map(sizeLimits);
  const budgets = sizeChanges(baseSize, headSize);
  const [baseSettings, headSettings] = [BASE, 'HEAD'].map(rev =>
    testSettings(Object.fromEntries(SETTINGS.map(path => [path, fileAt(rev, path)])))
  );
  const workflows = [BASE, 'HEAD'].flatMap(rev =>
    git('ls-tree', '-r', '--name-only', rev, '.github/workflows/')
      .split('\n')
      .filter(Boolean)
      .map(path => fileAt(rev, path) ?? '')
  );
  const scripts = scriptsRun(workflows, path => fileAt('HEAD', path) ?? fileAt(BASE, path));

  return {
    results: resultChanges(parseResults(baseResults), parseResults(headResults)),
    corpus: corpusChanges(
      { entries: parseCorpus(baseCorpus), report: parseCorpusReport(baseReport) },
      { entries: parseCorpus(headCorpus), report: parseCorpusReport(headReport) }
    ),
    examples: exampleChanges(
      examples.flatMap(([base]) => base),
      examples.flatMap(([, head]) => head)
    ),
    snapshotTestChanged: paths.includes('tests/resultSnapshot.test.ts'),
    // The first report adds the file, which changes no type.
    apiChanged: status.some(({ kind, path }) => path === API_REPORT && kind !== 'A'),
    packageChanged: paths.some(path => /^(?:src\/|package\.json$|tsup\.config\.ts$)/.test(path)),
    consumerFields: consumerFieldChanges(...both('package.json')),
    deletedTests: deletedTests(status),
    loweredLimits: [...baseLimits]
      .filter(([name, value]) => (headLimits.get(name) ?? 0) < value)
      .map(([name, value]) => `${name} from ${value} to ${headLimits.get(name) ?? 'none'}`),
    settingsChanged: baseSettings !== headSettings,
    ignores: addedIgnores(git('diff', '--unified=0', BASE, 'HEAD', '--', 'src/')),
    ciChanged: paths.filter(
      path => /^\.github\/(?:workflows|actions)\//.test(path) || scripts.has(path)
    ),
    removedExpects: removedExpects(
      git('diff', '--unified=0', BASE, 'HEAD', '--', ':(glob)tests/**/*.test.*')
    ),
    sizeRaises: budgets.raises,
    removedBudgets: budgets.removed,
    codeChanged: paths.filter(path =>
      /^(?:src\/|\.github\/(?:workflows|scripts|actions)\/|package\.json$|tsup\.config\.ts$)/.test(
        path
      )
    ),
    sizes: sizes(readOptional(process.env.SIZE_BASE), readOptional(process.env.SIZE_HEAD)),
  };
}

function main() {
  const facts = collect();
  const risk = assessRisk(facts);
  const text = summary(facts, risk);
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);

  const results = facts.results.changed.length + facts.corpus.outcomes.length;
  if (results > 0 && !listsChangedResults(process.env.PR_BODY ?? '')) {
    console.log(
      `::error::${escapeData(
        `The PR changes ${results} results, and its body has no "Changed results" list. ` +
          'Add a "Changed results" line or heading under "Description", list each result that ' +
          "the ticket doesn't ask for, and say that the others are what the ticket asks for."
      )}`
    );
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
