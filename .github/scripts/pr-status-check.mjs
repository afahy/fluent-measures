// Sets a `pr-status` commit status on a pull request's head commit with what pr-state.mjs
// decides, so the maintainer and agents can see on the PR what it waits on (AFA-100). Used by
// .github/workflows/pr-status.yml, which runs on the events that can change a PR's state.
//
// The status is `success` when the PR is ready, `failure` when it needs the agent, and
// `pending` while it waits on CI or a bot. When nothing else is open and the PR waits only for
// the maintainer, it's `success` too, with a description that starts "waiting-human:". So it
// doesn't look like a run that is still going (AFA-125). It isn't a required check, so `success`
// merges nothing. The script sets it only when it changes, so a run that finds no news writes
// nothing.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { classify, collect, createClient, OWN_STATUS } from './pr-state.mjs';

/** @type {Record<string, 'success' | 'failure' | 'pending'>} */
export const COMMIT_STATES = {
  ready: 'success',
  'needs-agent': 'failure',
  waiting: 'pending',
  'waiting-human': 'success',
};

/** GitHub keeps a commit status's description to 140 characters. */
const MAX_DESCRIPTION = 140;

/**
 * GitHub answers 422 ("Description doesn't accept 4-byte Unicode") for a character outside the
 * Basic Multilingual Plane, such as the 👀 in Codex's detail (AFA-108). This matches each one
 * with the joiners and the one space before it, brackets that hold only such characters, and
 * lone surrogates.
 */
const FOUR_BYTE =
  /\s*\((?:(?:\u200D|\uFE0F|\s)*[\u{10000}-\u{10FFFF}])+(?:\u200D|\uFE0F|\s)*\)|[ \t]?\u200D?[\u{10000}-\u{10FFFF}](?:\u200D|\uFE0F)*|[\uD800-\uDFFF]/gu;

/**
 * The status's one-line description: the state and the first reason or wait, without links,
 * and how many more there are. `pnpm pr:status` gives the whole list.
 *
 * @param {import('./pr-state.d.mts').PrStatus} status
 * @returns {string}
 */
export function describeStatus(status) {
  const items = status.state === 'waiting' ? status.waits : status.reasons;
  const first = items[0]
    ?.replace(/(?::| in)? https:\/\/\S+/g, '')
    .replace(FOUR_BYTE, '')
    .trim();
  const more = items.length > 1 ? ` (+${items.length - 1} more)` : '';
  const text =
    status.state === 'ready'
      ? 'ready: Nothing is left for the agent'
      : `${status.state}${first ? `: ${first}` : ''}${more}`;
  // Each character that is left is one UTF-16 unit, so the cut can't split one.
  return text.length > MAX_DESCRIPTION ? `${text.slice(0, MAX_DESCRIPTION - 1)}…` : text;
}

/**
 * The open PRs that an event can change.
 *
 * @param {import('./pr-state.d.mts').Client} api
 * @param {string} repo
 * @param {string} name The event name, as in GITHUB_EVENT_NAME.
 * @param {any} event The event payload.
 * @returns {Promise<number[]>}
 */
export async function prsForEvent(api, repo, name, event) {
  /** @param {string} sha */
  const openPrsWith = async sha => {
    const pulls = /** @type {{ number: number, state: string }[]} */ (
      await api.get(`/repos/${repo}/commits/${sha}/pulls`)
    );
    return pulls.filter(p => p.state === 'open').map(p => p.number);
  };
  switch (name) {
    case 'pull_request':
    case 'pull_request_review':
    case 'pull_request_review_comment':
      return [event.pull_request.number];
    case 'issue_comment':
      return event.issue.pull_request ? [event.issue.number] : [];
    case 'workflow_run': {
      // A run for a fork's PR lists no PRs, and GitHub doesn't find them by the fork's commit
      // either, so look them up by the fork's owner and branch.
      const run = event.workflow_run;
      const listed = run.pull_requests.map((/** @type {any} */ p) => p.number);
      if (listed.length > 0) return listed;
      const head = encodeURIComponent(`${run.head_repository.owner.login}:${run.head_branch}`);
      const pulls = /** @type {{ number: number }[]} */ (
        await api.getAll(`/repos/${repo}/pulls?state=open&head=${head}`)
      );
      return pulls.map(p => p.number);
    }
    case 'status':
      return openPrsWith(event.sha);
    // Bots' and CI's timers run out without an event, so a schedule checks every open PR.
    case 'schedule':
    case 'workflow_dispatch': {
      const pulls = /** @type {{ number: number }[]} */ (
        await api.getAll(`/repos/${repo}/pulls?state=open`)
      );
      return pulls.map(p => p.number);
    }
    default:
      return [];
  }
}

/**
 * Works out a PR's state and sets its `pr-status` commit status if that changed.
 *
 * @param {import('./pr-state.d.mts').Client} api
 * @param {(path: string, body: unknown) => Promise<unknown>} post
 * @param {string} repo
 * @param {number} number
 * @param {number} [now]
 * @returns {Promise<{ state: string, description: string } | null>} The status it set, or null.
 */
export async function setStatus(api, post, repo, number, now = Date.now()) {
  const snapshot = await collect(api, repo, number);
  const status = classify(snapshot, now);
  // A draft can wait for the maintainer while its CI still runs. It stays pending until then.
  const state =
    status.state === 'waiting-human' && status.waits.length > 0
      ? 'pending'
      : COMMIT_STATES[status.state];
  // A merged or closed PR keeps its last status.
  if (!state) return null;
  const description = describeStatus(status);
  const current = snapshot.statuses
    .filter(s => s.context === OWN_STATUS)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  if (current?.state === state && current.description === description) return null;
  await post(`/repos/${repo}/statuses/${status.head}`, {
    state,
    context: OWN_STATUS,
    description,
    target_url: status.url,
  });
  return { state, description };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const name = process.env.GITHUB_EVENT_NAME ?? '';
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH ?? '', 'utf8'));
  const repo = process.env.GITHUB_REPOSITORY ?? '';
  const token = process.env.GITHUB_TOKEN ?? '';
  const apiUrl = process.env.GITHUB_API_URL || 'https://api.github.com';
  const api = createClient({ token, apiUrl });
  /** @type {(path: string, body: unknown) => Promise<unknown>} */
  const post = async (path, body) => {
    const response = await fetch(`${apiUrl}${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`POST ${path} answered ${response.status}`);
    return response.json();
  };
  // One PR that fails, for example on a 502, doesn't stop the others. The run still fails.
  for (const number of await prsForEvent(api, repo, name, event)) {
    try {
      const set = await setStatus(api, post, repo, number);
      console.log(set ? `#${number}: ${set.state}, ${set.description}` : `#${number}: no change`);
    } catch (error) {
      console.error(`#${number}: ${/** @type {Error} */ (error).message}`);
      process.exitCode = 1;
    }
  }
}
