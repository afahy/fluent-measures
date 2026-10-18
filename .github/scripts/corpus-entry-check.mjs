// Checks that a fix PR adds its failure inputs to the measurement corpus, so that each fixed bug
// stays in the parser's score. Run it from the repository root on a pull request merge commit.
// Used by .github/workflows/regression-test.yml.
//
// Only a fix to the parser needs an entry. A fix to a package.json script, the build config, an
// exported type or the exports has no measurement input, as in #143. Nor does a change to only
// comments or formatting under src/.
//
// Reads PR_BODY, the PR's description. When it names a Linear ticket on its `Fixes` or `Part of`
// line, a new entry must have that ticket as its source. When it names a GitHub issue there, the
// source must be the issue's URL. When it names neither, the source can be any ticket ID or URL,
// but not "handwritten".

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { normalizeSource } from './normalize-source.mjs';
import { escapeData } from './workflow-commands.mjs';

// HEAD is the merge of the PR into the base branch, so its first parent is the base branch.
const BASE = 'HEAD^1';
const CORPUS = 'tests/corpus/measurements.jsonl';
// The files under src/ that hold no parsing code.
const NOT_PARSER = ['src/index.ts', 'src/types.ts'];
// A line such as "Fixes AFA-12", "Closes: #4" or "- Part of [AFA-7](https://linear.app/...)".
const REFERENCE = /^[^\w\n]*(?:fixes|closes|resolves|part of)\b[^\w\n]*(AFA-\d+|#\d+)\b/im;

/**
 * Whether the PR changes the parser: a file under src/ other than the exports and the types.
 *
 * @param {string[]} files The paths whose code the PR changes.
 * @returns {boolean}
 */
export function changesParser(files) {
  return files.some(file => file.startsWith('src/') && !NOT_PARSER.includes(file));
}

/**
 * Whether a change to a file changes more than its comments or formatting.
 *
 * @param {string} path
 * @param {string | null} before The file on the base branch, or null when it is new.
 * @param {string | null} after The file in the PR, or null when the PR deletes it.
 * @returns {boolean}
 */
export function codeChanged(path, before, after) {
  return (
    before === null ||
    after === null ||
    normalizeSource(path, before) !== normalizeSource(path, after)
  );
}

/**
 * @param {string} line
 * @returns {{ id?: unknown, source?: unknown }[]}
 */
function entryOf(line) {
  try {
    const entry = JSON.parse(line.slice(1));
    return entry && typeof entry === 'object' ? [entry] : [];
  } catch {
    return [];
  }
}

/**
 * The entries that a diff of the corpus adds. An edited entry keeps its `id`, so it doesn't count.
 * A line that isn't JSON counts as no entry, because the corpus test fails for it anyway.
 *
 * @param {string} diff `git diff` output for the corpus file.
 * @returns {{ id?: unknown, source?: unknown }[]}
 */
export function addedEntries(diff) {
  const lines = diff.split('\n');
  const removed = new Set(
    lines
      .filter(line => line.startsWith('-') && !line.startsWith('---'))
      .flatMap(entryOf)
      .map(entry => entry.id)
  );
  return lines
    .filter(line => line.startsWith('+') && !line.startsWith('+++'))
    .flatMap(entryOf)
    .filter(entry => !removed.has(entry.id));
}

/**
 * The Linear ticket on the PR body's `Fixes` or `Part of` line, if it names one.
 *
 * @param {string} body
 * @returns {string | null}
 */
export function ticketOf(body) {
  const reference = REFERENCE.exec(body)?.[1];
  return reference && !reference.startsWith('#') ? reference.toUpperCase() : null;
}

/**
 * The GitHub issue number on the PR body's `Fixes` or `Part of` line, if it names one.
 *
 * @param {string} body
 * @returns {number | null}
 */
export function issueOf(body) {
  const reference = REFERENCE.exec(body)?.[1];
  return reference?.startsWith('#') ? Number(reference.slice(1)) : null;
}

/**
 * Whether one added entry has the ticket, or the issue's URL, as its source. When the body names
 * neither, any ticket ID or https URL will do.
 *
 * @param {{ source?: unknown }[]} entries
 * @param {string | null} ticket
 * @param {number | null} [issue]
 * @returns {boolean}
 */
export function hasTicketEntry(entries, ticket, issue = null) {
  return entries.some(({ source }) => {
    const text = String(source);
    if (ticket !== null) return text === ticket;
    if (issue !== null) {
      const number = /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/issues\/(\d+)$/.exec(text)?.[1];
      return Number(number) === issue;
    }
    return /^(?:AFA-\d+|https:\/\/\S+)$/.test(text);
  });
}

/**
 * @param {string} rev
 * @param {string} path
 * @returns {string | null}
 */
function fileAt(rev, path) {
  try {
    return execFileSync('git', ['show', `${rev}:${path}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

function main() {
  const files = execFileSync(
    'git',
    ['diff', '--name-only', '-z', '--no-renames', BASE, 'HEAD', '--', 'src/'],
    { encoding: 'utf8' }
  )
    .split('\0')
    .filter(Boolean);
  const changed = files.filter(path => codeChanged(path, fileAt(BASE, path), fileAt('HEAD', path)));
  if (!changesParser(changed)) {
    console.log("The PR doesn't change the parser's code in src/, so it needs no corpus entry.");
    return;
  }
  const diff = execFileSync('git', ['diff', '--unified=0', BASE, 'HEAD', '--', CORPUS], {
    encoding: 'utf8',
  });
  const body = process.env.PR_BODY ?? '';
  const ticket = ticketOf(body);
  const issue = issueOf(body);
  const entries = addedEntries(diff);
  const named = ticket ?? (issue === null ? null : `issue #${issue}`);
  if (hasTicketEntry(entries, ticket, issue)) {
    console.log(
      `The PR adds ${entries.length} corpus entries, with one from ${named ?? 'a ticket'}.`
    );
    return;
  }
  const source = ticket
    ? `"${ticket}"`
    : issue === null
      ? 'the ticket ID or the URL of the issue'
      : `the URL of issue #${issue}`;
  console.log(
    `::error file=${CORPUS}::${escapeData(
      `A fix adds at least one new corpus entry built from the ticket's failure inputs, with ${source} as its "source". See "Measurement corpus" in CONTRIBUTING.md.`
    )}`
  );
  process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
