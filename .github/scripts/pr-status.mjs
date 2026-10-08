// Prints what each pull request is waiting on, so an agent that watches PRs doesn't have to
// write its own checks (AFA-98). pr-state.mjs holds the rules.
//
// Usage: pnpm pr:status <pr>... [--json] [--wait] [--timeout <minutes>] [--interval <seconds>]
//                               [--no-requests] [--repo <owner/name>]
//
// The state of each PR, from most to least urgent, with the exit code:
//   needs-agent    10  The agent has something to do: failed CI, a bot thread with no reply,
//                      a merge conflict, or a bot review to ask for. "Do" lists the requests.
//   ready           0  Nothing is left for the agent. Merge it if AGENTS.md lets you.
//   merged         40
//   closed         41
//   waiting-human  30  Only a person can move it, such as a draft or a merge GitHub blocks.
//   waiting        20  CI or a bot review is still running.
// With several PRs, the exit code is that of the most urgent state. A bad argument exits with
// 2, a token that GitHub refuses with 3, and another API error with 1.
//
// --wait prints nothing while it polls. It rides out up to five network or server errors in a
// row, its first request too, and waits out a rate limit that ends before --timeout (AFA-147). It
// returns at once if a PR needs the agent, is ready, or has closed. Otherwise it returns when a PR's state changes to anything but `waiting`, or
// when a waiting-human PR gets news, such as a bot reply. It stops after --timeout minutes
// (default 100, under the 2-hour limit for a background command). 304 answers to its polls
// don't count against GitHub's rate limit.
//
// --no-requests is for after the third review round, when AGENTS.md says not to ask Codex
// again: a Codex that hasn't reviewed is waited for until its 2 hours are up, not asked.
// CodeRabbit is never waited for or asked (AFA-138).
//
// The token comes from GH_TOKEN, GITHUB_TOKEN or `gh auth token`. The repository comes from
// --repo, GITHUB_REPOSITORY or the origin remote.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { classify, collect, createClient, digest, mostUrgent, STATES } from './pr-state.mjs';

// Node's fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY is set when Node starts, as in
// Claude Code cloud sessions. Run again with it set.
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const self = fileURLToPath(import.meta.url);
  const child = spawnSync(
    process.execPath,
    ['--disable-warning=UNDICI-EHPA', self, ...process.argv.slice(2)],
    { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } }
  );
  process.exit(child.status ?? 1);
}

const USAGE =
  'Usage: pnpm pr:status <pr>... [--json] [--wait] [--timeout <minutes>] ' +
  '[--interval <seconds>] [--no-requests] [--repo <owner/name>]';

/**
 * @param {string[]} args
 */
function parseArgs(args) {
  const options = { prs: /** @type {number[]} */ ([]), json: false, wait: false, requests: true };
  let timeout = 100;
  let interval = 60;
  let repo = '';
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') options.json = true;
    else if (arg === '--wait') options.wait = true;
    else if (arg === '--no-requests') options.requests = false;
    else if (arg === '--timeout') timeout = Number(args[++i]);
    else if (arg === '--interval') interval = Number(args[++i]);
    else if (arg === '--repo') repo = args[++i] ?? '';
    else if (/^#?\d+$/.test(arg)) options.prs.push(Number(arg.replace('#', '')));
    else throw new Error(`Unknown argument "${arg}".\n${USAGE}`);
  }
  if (options.prs.length === 0) throw new Error(USAGE);
  if (!(timeout > 0)) throw new Error('--timeout takes a number of minutes above 0.');
  if (!(interval >= 1)) throw new Error('--interval takes a number of seconds of at least 1.');
  return { ...options, timeout, interval, repo: repo || findRepo() };
}

/** @returns {string} */
function findRepo() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  const remote = spawnSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' });
  const match = /([^/:]+)\/([^/]+?)(?:\.git)?\s*$/.exec(remote.stdout ?? '');
  if (!match) throw new Error('Pass --repo <owner/name>: there is no origin remote to read.');
  return `${match[1]}/${match[2]}`;
}

/** @returns {string | null} */
function findToken() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  const gh = spawnSync('gh', ['auth', 'token'], { encoding: 'utf8' });
  return gh.status === 0 && gh.stdout.trim() ? gh.stdout.trim() : null;
}

/**
 * @param {import('./pr-state.d.mts').PrStatus} status
 * @returns {string}
 */
function describe(status) {
  const lines = [
    `#${status.pr} ${status.state}: ${status.title}`,
    `  ${status.url}`,
    `  Head ${status.head.slice(0, 7)}, pushed ${status.pushedAt}`,
    `  GitHub merge state: ${status.mergeableState ?? 'not worked out yet'}`,
  ];
  const { passed, pending, failed } = status.ci;
  const ci = [`${passed.length} passed`];
  if (pending.length) ci.push(`${pending.length} running (${pending.join(', ')})`);
  if (failed.length) ci.push(`${failed.length} failed (${failed.join(', ')})`);
  lines.push(`  CI: ${ci.join(', ')}`);
  lines.push(`  Codex: ${status.codex.state}. ${status.codex.detail}`);
  lines.push(`  CodeRabbit: ${status.coderabbit.state}. ${status.coderabbit.detail}`);
  for (const [title, items] of /** @type {const} */ ([
    ['Why', status.reasons],
    ['Do', status.actions],
    ['Waiting on', status.waits],
    ['Notes', status.notes],
  ])) {
    if (items.length) lines.push(`  ${title}:`, ...items.map(item => `    - ${item}`));
  }
  return lines.join('\n');
}

/**
 * @param {import('./pr-state.d.mts').PrStatus[]} statuses
 * @param {boolean} json
 * @param {string} [heading]
 * @returns {never}
 */
function finish(statuses, json, heading) {
  if (json) console.log(JSON.stringify(statuses, null, 2));
  else console.log([heading, ...statuses.map(describe)].filter(Boolean).join('\n\n'));
  process.exit(STATES[mostUrgent(statuses.map(s => s.state))]);
}

/** @param {number} ms */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const ACTIONABLE = new Set(['needs-agent', 'ready', 'merged', 'closed']);

let options;
try {
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(/** @type {Error} */ (error).message);
  process.exit(2);
}
const { prs, json, wait, timeout, interval, repo, requests } = options;
const api = createClient({
  token: findToken(),
  apiUrl: process.env.GITHUB_API_URL || 'https://api.github.com',
});
const check = async () =>
  Promise.all(
    prs.map(async pr => classify(await collect(api, repo, pr), Date.now(), { requests }))
  );

/**
 * Whether GitHub refused the token: a 401, or a 403 that isn't a rate limit. Another try won't
 * help, so the call ends with its own exit code.
 *
 * @param {unknown} error
 */
const refused = error => {
  const { status, retryAt } = /** @type {{ status?: number, retryAt?: number | null }} */ (error);
  return status === 401 || (status === 403 && !retryAt);
};

try {
  const started = Date.now();
  const deadline = started + timeout * 60 * 1000;
  let failures = 0;
  /**
   * One poll's statuses, or null after an error that a later poll can ride out. Without --wait,
   * any error ends the call. With it, a refused token or a fifth error in a row ends it, and a
   * rate limit that ends in time is waited out.
   */
  const poll = async () => {
    try {
      const statuses = await check();
      failures = 0;
      return statuses;
    } catch (error) {
      if (!wait || refused(error)) throw error;
      const retryAt = /** @type {{ retryAt?: number | null }} */ (error).retryAt;
      if (retryAt && retryAt < deadline) await sleep(retryAt - Date.now());
      else if (++failures >= 5) throw error;
      return null;
    }
  };
  const pause = () => sleep(Math.min(interval * 1000, Math.max(deadline - Date.now(), 0)));

  let first = await poll();
  while (!first && Date.now() < deadline) {
    await pause();
    first = await poll();
  }
  if (!first) throw new Error(`GitHub didn't answer in ${timeout} min.`);
  if (!wait || first.some(s => ACTIONABLE.has(s.state))) finish(first, json);

  const before = new Map(first.map(s => [s.pr, digest(s)]));
  let latest = first;
  while (Date.now() < deadline) {
    await pause();
    const statuses = await poll();
    if (!statuses) continue;
    latest = statuses;
    const changed = latest.filter(s => s.state !== 'waiting' && digest(s) !== before.get(s.pr));
    if (changed.length > 0) {
      const minutes = Math.round((Date.now() - started) / 60000);
      const which = changed.map(s => `#${s.pr} is now ${s.state}`).join(', ');
      finish(latest, json, `After ${minutes} min: ${which}.`);
    }
  }
  finish(latest, json, `Nothing changed in ${timeout} min.`);
} catch (error) {
  const { message } = /** @type {Error} */ (error);
  if (refused(error)) {
    console.error(`${message}\nGitHub refused the token. Set GH_TOKEN, or run \`gh auth login\`.`);
    process.exit(3);
  }
  console.error(message);
  process.exit(1);
}
