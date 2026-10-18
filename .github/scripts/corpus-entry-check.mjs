// Checks that a fix PR adds its failure inputs to the measurement corpus, so that each fixed bug
// stays in the parser's score. Run it from the repository root on a pull request merge commit.
// Used by .github/workflows/regression-test.yml.
//
// Reads PR_BODY, the PR's description. When it names a Linear ticket on its `Fixes` or `Part of`
// line, an added entry must have that ticket as its source. When it doesn't, as for a GitHub
// issue, the source can be any ticket ID or the issue's URL, but not "handwritten".

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { escapeData } from './workflow-commands.mjs';

// HEAD is the merge of the PR into the base branch, so its first parent is the base branch.
const BASE = 'HEAD^1';
const CORPUS = 'tests/corpus/measurements.jsonl';

/**
 * The entries that a diff of the corpus adds. A line that isn't JSON counts as no entry, because
 * the corpus test fails for it anyway.
 *
 * @param {string} diff `git diff` output for the corpus file.
 * @returns {{ id?: unknown, source?: unknown }[]}
 */
export function addedEntries(diff) {
  return diff
    .split('\n')
    .filter(line => line.startsWith('+') && !line.startsWith('+++'))
    .flatMap(line => {
      try {
        const entry = JSON.parse(line.slice(1));
        return entry && typeof entry === 'object' ? [entry] : [];
      } catch {
        return [];
      }
    });
}

/**
 * The Linear ticket on the PR body's `Fixes` or `Part of` line, if it names one.
 *
 * @param {string} body
 * @returns {string | null}
 */
export function ticketOf(body) {
  return /^(?:[Ff]ixes|[Pp]art of)\s+(AFA-\d+)\b/m.exec(body)?.[1] ?? null;
}

/**
 * Whether one added entry has the ticket as its source. When the body names no ticket, any
 * ticket ID or https URL will do.
 *
 * @param {{ source?: unknown }[]} entries
 * @param {string | null} ticket
 * @returns {boolean}
 */
export function hasTicketEntry(entries, ticket) {
  return entries.some(({ source }) =>
    ticket === null ? /^(?:AFA-\d+|https:\/\/\S+)$/.test(String(source)) : source === ticket
  );
}

function main() {
  const diff = execFileSync('git', ['diff', '--unified=0', BASE, 'HEAD', '--', CORPUS], {
    encoding: 'utf8',
  });
  const ticket = ticketOf(process.env.PR_BODY ?? '');
  const entries = addedEntries(diff);
  if (hasTicketEntry(entries, ticket)) {
    console.log(
      `The PR adds ${entries.length} corpus entries, with one from ${ticket ?? 'a ticket'}.`
    );
    return;
  }
  const source = ticket ? `"${ticket}"` : 'the ticket ID or the URL of the issue';
  console.log(
    `::error file=${CORPUS}::${escapeData(
      `A fix adds at least one corpus entry built from the ticket's failure inputs, with ${source} as its "source". See "Measurement corpus" in CONTRIBUTING.md.`
    )}`
  );
  process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
