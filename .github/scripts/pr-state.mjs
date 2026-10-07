// Works out what a pull request is waiting on, from GitHub REST API responses. collect() fetches
// the responses and classify() reads them, so tests can pass recorded responses instead.
// pr-status.mjs prints the result. GraphQL is blocked in Claude Code cloud sessions, so this
// uses only the REST API.
//
// The rules come from AGENTS.md ("Handle findings and CI" and "Merge your own PR") and from
// mistakes that watchers made on earlier PRs (AFA-98):
//   - Every check is for the PR's current head commit. A 👍 or a review of an earlier commit
//     doesn't count.
//   - Codex is done when it reviews the head commit, or when its summary comment says the
//     review of the head commit is Completed. 👀 means it's still running.
//   - CodeRabbit sets a "CodeRabbit" commit status on each commit it looks at. "Review rate
//     limited" is a success status, so it must not count as a passing check or a review.
//   - CodeRabbit's summary and rate-limit comments also name a commit range, but only its
//     reviews mean that it reviewed the commit.
//   - Bots name commits by short SHAs, so a SHA matches any prefix of 7 or more characters.

/** The bots whose reviews AGENTS.md asks agents to answer. */
export const CODEX = 'chatgpt-codex-connector[bot]';
export const CODERABBIT = 'coderabbitai[bot]';

/** The commit status that pr-status.yml sets. It's an output, so it isn't a check to wait on. */
export const OWN_STATUS = 'pr-status';

const MINUTE = 60 * 1000;
/** How long a bot gets to start on a push before the agent asks it (AGENTS.md). */
export const BOT_START_WAIT = 30 * MINUTE;
/** How long to wait for a bot in all (AGENTS.md: "Wait at most two hours for a bot"). */
export const BOT_MAX_WAIT = 120 * MINUTE;
/** CodeRabbit's wait when its rate-limit note gives no time. Its notes so far said 14–57 min. */
export const RATE_LIMIT_DEFAULT_WAIT = 60 * MINUTE;
/** How long CI gets to start before a missing run is reported. */
export const CI_START_WAIT = 30 * MINUTE;

/** Check run conclusions that fail a PR. The others (success, neutral, skipped) pass. */
const FAILED_CONCLUSIONS = new Set([
  'failure',
  'timed_out',
  'cancelled',
  'action_required',
  'startup_failure',
  'stale',
]);

/** The states, from most to least urgent, with the exit code pr-status.mjs uses for each. */
export const STATES = {
  'needs-agent': 10,
  ready: 0,
  merged: 40,
  closed: 41,
  'waiting-human': 30,
  waiting: 20,
};

/**
 * Whether two commit SHAs name the same commit. Either may be a short SHA of 7 or more
 * characters.
 *
 * @param {string | null | undefined} a
 * @param {string | null | undefined} b
 * @returns {boolean}
 */
export function shaMatches(a, b) {
  if (!a || !b) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 7 && long.toLowerCase().startsWith(short.toLowerCase());
}

/**
 * @param {{ user?: { login?: string, type?: string } | null }} item
 * @returns {boolean}
 */
function byBot(item) {
  return item.user?.type === 'Bot' || (item.user?.login ?? '').endsWith('[bot]');
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function byTime(a, b) {
  return Date.parse(a) - Date.parse(b);
}

/**
 * When the head commit reached GitHub. A commit's own date can be much earlier than its push,
 * so this uses the first check run on the commit, and the committer date only if there is none.
 *
 * @param {import('./pr-state.d.mts').Snapshot} snapshot
 * @returns {string}
 */
export function pushedAt(snapshot) {
  const starts = snapshot.checkRuns
    .map(run => run.started_at)
    .filter(Boolean)
    .sort(byTime);
  return starts[0] ?? snapshot.headCommit.committer.date;
}

/**
 * Sums up CI on the head commit: the latest run of each check, and the latest status for each
 * context other than CodeRabbit's and this script's.
 *
 * @param {import('./pr-state.d.mts').CheckRun[]} checkRuns
 * @param {import('./pr-state.d.mts').CommitStatus[]} statuses
 * @returns {import('./pr-state.d.mts').CiSummary}
 */
export function ciSummary(checkRuns, statuses) {
  /** @type {Map<string, import('./pr-state.d.mts').CheckRun>} */
  const runs = new Map();
  for (const run of checkRuns) {
    // A re-run is a new run with the same name in the same check suite.
    const key = `${run.check_suite?.id ?? ''}\u0000${run.name}`;
    const seen = runs.get(key);
    if (!seen || run.id > seen.id) runs.set(key, run);
  }
  /** @type {Map<string, import('./pr-state.d.mts').CommitStatus>} */
  const contexts = new Map();
  for (const status of statuses) {
    if (status.context === 'CodeRabbit' || status.context === OWN_STATUS) continue;
    const seen = contexts.get(status.context);
    if (!seen || byTime(status.created_at, seen.created_at) > 0)
      contexts.set(status.context, status);
  }
  /** @type {import('./pr-state.d.mts').CiSummary} */
  const summary = { passed: [], pending: [], failed: [] };
  for (const run of runs.values()) {
    if (run.status !== 'completed') summary.pending.push(run.name);
    else if (FAILED_CONCLUSIONS.has(run.conclusion ?? '')) summary.failed.push(run.name);
    else summary.passed.push(run.name);
  }
  for (const status of contexts.values()) {
    if (status.state === 'pending') summary.pending.push(status.context);
    else if (status.state === 'success') summary.passed.push(status.context);
    else summary.failed.push(status.context);
  }
  for (const list of Object.values(summary)) list.sort();
  return summary;
}

/**
 * Reads the review rows in Codex's summary comment. Each row names a review, its status and
 * the short SHA it's for, as in:
 *   | 📝 **Code Review** | ✅ **Completed** <relative-time ...> | `333a541` | New commits |
 *
 * @param {string} body
 * @returns {{ review: string, status: string, commit: string | null }[]}
 */
export function codexSummaryRows(body) {
  /** @type {{ review: string, status: string, commit: string | null }[]} */
  const rows = [];
  for (const line of body.split('\n')) {
    const cells = line.split('|').map(cell => cell.trim());
    // A row has an empty cell before the first | and after the last one.
    if (cells.length < 6) continue;
    const review = /\*\*([^*]+)\*\*/.exec(cells[1])?.[1];
    const status = /\*\*([^*]+)\*\*/.exec(cells[2])?.[1];
    if (!review || !status) continue;
    rows.push({ review, status, commit: /`([0-9a-f]{7,40})`/i.exec(cells[3])?.[1] ?? null });
  }
  return rows;
}

/**
 * Reads when CodeRabbit's rate limit ends from a note such as "Next included review available
 * in 57 minutes." The wait counts from when the note was last edited.
 *
 * @param {string} body
 * @param {string} editedAt
 * @returns {string | null} An ISO time, or null if the note gives no wait.
 */
export function rateLimitResetAt(body, editedAt) {
  const sentence = /available in ([^.]*)\./i.exec(body)?.[1];
  if (!sentence) return null;
  const units = { hour: 60 * MINUTE, minute: MINUTE, second: 1000 };
  let wait = 0;
  for (const [, amount, unit] of sentence.matchAll(/(\d+)\s*(hour|minute|second)s?/gi)) {
    wait += Number(amount) * units[/** @type {keyof typeof units} */ (unit.toLowerCase())];
  }
  if (wait === 0) return null;
  return new Date(Date.parse(editedAt) + wait).toISOString();
}

/**
 * The comments in which a person, not a bot, asked a bot to review since the head was pushed.
 *
 * @param {import('./pr-state.d.mts').IssueComment[]} comments
 * @param {RegExp} command
 * @param {string} since
 */
function requests(comments, command, since) {
  return comments
    .filter(c => !byBot(c) && command.test(c.body ?? '') && byTime(c.created_at, since) >= 0)
    .sort((a, b) => byTime(a.created_at, b.created_at));
}

/**
 * Codex's state for the head commit.
 *
 * @param {import('./pr-state.d.mts').Snapshot} snapshot
 * @param {number} now
 * @returns {import('./pr-state.d.mts').BotState}
 */
export function codexState(snapshot, now) {
  const head = snapshot.pull.head.sha;
  const pushed = pushedAt(snapshot);
  const waited = now - Date.parse(pushed);
  if (snapshot.reviews.some(r => r.user?.login === CODEX && shaMatches(r.commit_id, head))) {
    return { state: 'done', detail: `Codex reviewed ${head.slice(0, 7)} and left comments` };
  }
  const summary = snapshot.issueComments.find(
    c => c.user?.login === CODEX && (c.body ?? '').includes('codex-pull-request-review-summary')
  );
  const row = codexSummaryRows(summary?.body ?? '').find(r => /code review/i.test(r.review));
  if (row && shaMatches(row.commit, head)) {
    if (/completed/i.test(row.status)) {
      return { state: 'done', detail: `Codex completed its review of ${head.slice(0, 7)}` };
    }
    if (/running|queued|pending|progress/i.test(row.status)) {
      return { state: 'running', detail: `Codex's review of ${head.slice(0, 7)} is ${row.status}` };
    }
  }
  if (snapshot.reactions.some(r => r.user?.login === CODEX && r.content === 'eyes')) {
    return { state: 'running', detail: 'Codex is reviewing (👀)' };
  }
  const reviewed = row?.commit ? `; its last review was of ${row.commit}` : '';
  if (waited >= BOT_MAX_WAIT) {
    return {
      state: 'gave-up',
      detail: `Codex hasn't reviewed ${head.slice(0, 7)} in the 2 hours since the push${reviewed}`,
    };
  }
  const asked = requests(snapshot.issueComments, /@codex\s+review\b/i, pushed);
  if (asked.length > 0) {
    return {
      state: 'requested',
      detail: `Asked at ${asked[0].created_at} for a review of ${head.slice(0, 7)}${reviewed}`,
      until: new Date(Date.parse(pushed) + BOT_MAX_WAIT).toISOString(),
    };
  }
  if (waited < BOT_START_WAIT) {
    return {
      state: 'pending',
      detail: `Codex hasn't started on ${head.slice(0, 7)}${reviewed}`,
      until: new Date(Date.parse(pushed) + BOT_START_WAIT).toISOString(),
    };
  }
  return {
    state: 'not-requested',
    detail: `Codex hasn't reviewed ${head.slice(0, 7)} 30 minutes after the push${reviewed}`,
    action: 'Post `@codex review`',
  };
}

/**
 * CodeRabbit's state for the head commit.
 *
 * @param {import('./pr-state.d.mts').Snapshot} snapshot
 * @param {number} now
 * @returns {import('./pr-state.d.mts').BotState}
 */
export function coderabbitState(snapshot, now) {
  const head = snapshot.pull.head.sha;
  const short = head.slice(0, 7);
  const pushed = pushedAt(snapshot);
  const waited = now - Date.parse(pushed);
  const status = snapshot.statuses
    .filter(s => s.context === 'CodeRabbit')
    .sort((a, b) => byTime(b.created_at, a.created_at))[0];
  const reviewedHead = snapshot.reviews.some(
    r =>
      r.user?.login === CODERABBIT &&
      [...(r.body ?? '').matchAll(/between [0-9a-f]{7,40} and ([0-9a-f]{7,40})/gi)].some(m =>
        shaMatches(m[1], head)
      )
  );
  if (reviewedHead || /review completed/i.test(status?.description ?? '')) {
    return { state: 'done', detail: `CodeRabbit reviewed ${short}` };
  }
  if (status?.state === 'pending') {
    return { state: 'running', detail: `CodeRabbit is reviewing ${short}` };
  }
  const asked = requests(snapshot.issueComments, /@coderabbitai\s+review\b/i, pushed);
  // CodeRabbit answers a request it won't act on with "Action not completed".
  const refused = asked.length
    ? snapshot.issueComments.find(
        c =>
          c.user?.login === CODERABBIT &&
          /action not completed/i.test(c.body ?? '') &&
          byTime(c.created_at, asked[asked.length - 1].created_at) >= 0
      )
    : undefined;
  if (refused) {
    const reason = /<\/summary>\s*([^\n]+)/i.exec(refused.body ?? '')?.[1]?.trim();
    return {
      state: 'gave-up',
      detail: `CodeRabbit refused the review request${reason ? `: ${reason}` : ''}`,
    };
  }
  if (waited >= BOT_MAX_WAIT) {
    return {
      state: 'gave-up',
      detail: `CodeRabbit hasn't reviewed ${short} in the 2 hours since the push`,
    };
  }
  if (asked.length > 0) {
    return {
      state: 'requested',
      detail: `Asked at ${asked[0].created_at} for a review of ${short}`,
      until: new Date(Date.parse(pushed) + BOT_MAX_WAIT).toISOString(),
    };
  }
  if (/rate limit/i.test(status?.description ?? '')) {
    // Only a note edited after the push is about this commit.
    const note = snapshot.issueComments
      .filter(
        c =>
          c.user?.login === CODERABBIT &&
          /rate limited by coderabbit/i.test(c.body ?? '') &&
          byTime(c.updated_at, pushed) >= 0
      )
      .sort((a, b) => byTime(b.updated_at, a.updated_at))[0];
    const resetAt =
      (note && rateLimitResetAt(note.body ?? '', note.updated_at)) ??
      new Date(Date.parse(status?.created_at ?? pushed) + RATE_LIMIT_DEFAULT_WAIT).toISOString();
    if (now < Date.parse(resetAt)) {
      return {
        state: 'rate-limited',
        detail: `CodeRabbit is rate limited until ${resetAt}${note ? '' : ' (assumed)'}`,
        until: resetAt,
      };
    }
    return {
      state: 'not-requested',
      detail: `CodeRabbit's rate limit ended at ${resetAt}`,
      action: 'Post `@coderabbitai review`',
    };
  }
  if (status?.state === 'success') {
    // For example "Review skipped", when every changed file is in an ignored path.
    return { state: 'done', detail: `CodeRabbit: ${status.description ?? 'success'}` };
  }
  if (status) {
    return {
      state: 'not-requested',
      detail: `CodeRabbit's review of ${short} ended with "${status.description ?? status.state}"`,
      action: 'Post `@coderabbitai review`',
    };
  }
  if (waited < BOT_START_WAIT) {
    return {
      state: 'pending',
      detail: `CodeRabbit hasn't started on ${short}`,
      until: new Date(Date.parse(pushed) + BOT_START_WAIT).toISOString(),
    };
  }
  return {
    state: 'not-requested',
    detail: `CodeRabbit hasn't started on ${short} 30 minutes after the push`,
    action: 'Post `@coderabbitai review`',
  };
}

/**
 * Review threads that a bot started and no person has replied to. AGENTS.md asks agents to
 * reply to each bot thread.
 *
 * @param {import('./pr-state.d.mts').ReviewComment[]} comments
 * @returns {import('./pr-state.d.mts').ReviewComment[]}
 */
export function unansweredBotThreads(comments) {
  const answered = new Set(
    comments.filter(c => !byBot(c) && c.in_reply_to_id).map(c => c.in_reply_to_id)
  );
  return comments
    .filter(c => !c.in_reply_to_id && byBot(c) && !answered.has(c.id))
    .sort((a, b) => byTime(a.created_at, b.created_at));
}

/**
 * Bot replies that came after a person's last reply in the same thread. A bot often answers a
 * fix with a thank-you, so these are worth reading but don't block the PR.
 *
 * @param {import('./pr-state.d.mts').ReviewComment[]} comments
 * @returns {import('./pr-state.d.mts').ReviewComment[]}
 */
export function botFollowUps(comments) {
  /** @type {Map<number, import('./pr-state.d.mts').ReviewComment[]>} */
  const threads = new Map();
  for (const comment of comments) {
    if (!comment.in_reply_to_id) continue;
    const thread = threads.get(comment.in_reply_to_id) ?? [];
    thread.push(comment);
    threads.set(comment.in_reply_to_id, thread);
  }
  /** @type {import('./pr-state.d.mts').ReviewComment[]} */
  const followUps = [];
  for (const thread of threads.values()) {
    thread.sort((a, b) => byTime(a.created_at, b.created_at));
    const last = thread[thread.length - 1];
    if (byBot(last) && thread.some(c => !byBot(c))) followUps.push(last);
  }
  return followUps.sort((a, b) => byTime(a.created_at, b.created_at));
}

/**
 * CodeRabbit reviews since the push that put comments in the review body instead of in a
 * thread ("Outside diff range comments"), with no later comment or review from a person.
 *
 * @param {import('./pr-state.d.mts').Snapshot} snapshot
 * @returns {import('./pr-state.d.mts').Review[]}
 */
export function unansweredReviewBodies(snapshot) {
  const pushed = pushedAt(snapshot);
  const human = [
    ...snapshot.issueComments.filter(c => !byBot(c)).map(c => c.created_at),
    ...snapshot.reviews.filter(r => !byBot(r) && r.submitted_at).map(r => r.submitted_at ?? ''),
  ];
  return snapshot.reviews.filter(
    r =>
      byBot(r) &&
      r.submitted_at &&
      byTime(r.submitted_at, pushed) >= 0 &&
      /outside diff range comments \(\d+\)/i.test(r.body ?? '') &&
      !human.some(t => byTime(t, r.submitted_at ?? '') > 0)
  );
}

/**
 * Each person's latest review that requests changes.
 *
 * @param {import('./pr-state.d.mts').Review[]} reviews
 * @returns {import('./pr-state.d.mts').Review[]}
 */
function changesRequested(reviews) {
  /** @type {Map<string, import('./pr-state.d.mts').Review>} */
  const latest = new Map();
  for (const review of reviews) {
    if (byBot(review) || !review.submitted_at) continue;
    if (!['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state)) continue;
    const login = review.user?.login ?? '';
    const seen = latest.get(login);
    if (!seen || byTime(review.submitted_at, seen.submitted_at ?? '') > 0)
      latest.set(login, review);
  }
  return [...latest.values()].filter(r => r.state === 'CHANGES_REQUESTED');
}

/**
 * Decides what a PR is waiting on.
 *
 * @param {import('./pr-state.d.mts').Snapshot} snapshot
 * @param {number} [now] Milliseconds since the epoch.
 * @returns {import('./pr-state.d.mts').PrStatus}
 */
export function classify(snapshot, now = Date.now()) {
  const { pull } = snapshot;
  const head = pull.head.sha;
  const pushed = pushedAt(snapshot);
  const ci = ciSummary(snapshot.checkRuns, snapshot.statuses);
  const threads = unansweredBotThreads(snapshot.reviewComments);
  const followUps = botFollowUps(snapshot.reviewComments);
  /** @type {string[]} */
  const reasons = [];
  /** @type {string[]} */
  const actions = [];
  /** @type {string[]} */
  const notes = [];
  /** @type {string[]} */
  const waits = [];

  const closed = pull.merged || pull.merged_at || pull.state === 'closed';
  /** @type {import('./pr-state.d.mts').BotState} */
  const skipped = closed
    ? { state: 'skipped', detail: 'The PR is closed' }
    : { state: 'skipped', detail: "The bots don't review drafts" };
  const codex = closed || pull.draft ? skipped : codexState(snapshot, now);
  const coderabbit = closed || pull.draft ? skipped : coderabbitState(snapshot, now);
  const result = (/** @type {import('./pr-state.d.mts').PrState} */ state) => ({
    pr: pull.number,
    title: pull.title,
    url: pull.html_url,
    state,
    head,
    pushedAt: pushed,
    reasons,
    actions,
    notes,
    waits,
    ci,
    codex,
    coderabbit,
  });

  // A closed PR still lists unanswered threads, for the final comment check after a merge.
  for (const thread of threads) {
    reasons.push(`${thread.user?.login} left a thread with no reply: ${thread.html_url}`);
  }
  for (const reply of followUps) {
    notes.push(`${reply.user?.login} replied after your reply: ${reply.html_url}`);
  }
  if (pull.merged || pull.merged_at) return result('merged');
  if (pull.state === 'closed') return result('closed');

  if (ci.failed.length > 0) reasons.push(`CI failed: ${ci.failed.join(', ')}`);
  const noChecks = ci.passed.length + ci.pending.length + ci.failed.length === 0;
  if (noChecks && now - Date.parse(pushed) >= CI_START_WAIT) {
    reasons.push(`No CI ran on ${head.slice(0, 7)} in the 30 minutes since the push`);
  }
  for (const review of unansweredReviewBodies(snapshot)) {
    reasons.push(`${review.user?.login} put comments outside the diff in ${review.html_url}`);
  }
  for (const review of changesRequested(snapshot.reviews)) {
    reasons.push(`${review.user?.login} requested changes: ${review.html_url}`);
  }
  if (pull.mergeable_state === 'dirty') reasons.push('The PR has a merge conflict with its base');
  for (const bot of [codex, coderabbit]) {
    if (bot.state === 'not-requested') reasons.push(bot.detail);
    if (bot.action) actions.push(bot.action);
    if (bot.state === 'gave-up') notes.push(bot.detail);
    if (['pending', 'running', 'requested', 'rate-limited'].includes(bot.state)) {
      const until = bot.until && !bot.detail.includes(bot.until) ? ` (until ${bot.until})` : '';
      waits.push(`${bot.detail}${until}`);
    }
  }
  if (ci.pending.length > 0) waits.push(`CI is running: ${ci.pending.join(', ')}`);
  if (noChecks && reasons.length === 0) waits.push(`CI hasn't started on ${head.slice(0, 7)}`);
  if (!pull.mergeable_state || pull.mergeable_state === 'unknown') {
    waits.push('GitHub is still working out whether the PR can merge');
  }
  if (reasons.length > 0) return result('needs-agent');
  if (waits.length > 0) return result('waiting');

  if (pull.draft) {
    reasons.push('The PR is a draft');
    return result('waiting-human');
  }
  if (codex.state === 'gave-up') {
    // AGENTS.md lets an agent merge only after Codex reviews the last commit.
    reasons.push('Codex never reviewed the head commit, so only the maintainer can merge it');
    return result('waiting-human');
  }
  if (pull.mergeable_state === 'blocked') {
    reasons.push('GitHub blocks the merge, usually until a required review');
    return result('waiting-human');
  }
  return result('ready');
}

/**
 * The most urgent of several states.
 *
 * @param {import('./pr-state.d.mts').PrState[]} states
 * @returns {import('./pr-state.d.mts').PrState}
 */
export function mostUrgent(states) {
  const order = /** @type {import('./pr-state.d.mts').PrState[]} */ (Object.keys(STATES));
  return order.find(state => states.includes(state)) ?? 'waiting';
}

/**
 * What --wait compares between polls. It leaves out anything that changes without news, such
 * as how long a bot has been running.
 *
 * @param {import('./pr-state.d.mts').PrStatus} status
 * @returns {string}
 */
export function digest(status) {
  const { state, head, reasons, actions, notes } = status;
  return JSON.stringify({ state, head, reasons, actions, notes });
}

/**
 * A small GitHub REST client. It follows every page of a list, and it sends each URL's last
 * ETag, so a poll that finds nothing new gets a 304, which doesn't count against the rate limit.
 *
 * @param {{ token?: string | null, apiUrl?: string, fetch?: typeof fetch }} [options]
 * @returns {import('./pr-state.d.mts').Client}
 */
export function createClient({
  token,
  apiUrl = 'https://api.github.com',
  fetch: get = fetch,
} = {}) {
  /** @type {Map<string, { etag: string, data: unknown, next: string | null }>} */
  const cache = new Map();

  /**
   * @param {string} url
   * @returns {Promise<{ data: unknown, next: string | null }>}
   */
  async function page(url) {
    /** @type {Record<string, string>} */
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'fluent-measures-pr-status',
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const cached = cache.get(url);
    if (cached) headers['If-None-Match'] = cached.etag;
    const response = await get(url, { headers });
    if (response.status === 304 && cached) return cached;
    if (!response.ok) {
      const remaining = response.headers.get('x-ratelimit-remaining');
      const reset = response.headers.get('x-ratelimit-reset');
      const limited = remaining === '0' && reset;
      const error = new Error(
        limited
          ? `GitHub's rate limit is used up until ${new Date(Number(reset) * 1000).toISOString()}`
          : `GitHub answered ${response.status} for ${url}: ${(await response.text()).slice(0, 200)}`
      );
      Object.assign(error, {
        status: response.status,
        retryAt: limited ? Number(reset) * 1000 : null,
      });
      throw error;
    }
    const next = /<([^>]+)>;\s*rel="next"/.exec(response.headers.get('link') ?? '')?.[1] ?? null;
    const result = { data: await response.json(), next };
    const etag = response.headers.get('etag');
    if (etag) cache.set(url, { etag, ...result });
    return result;
  }

  return {
    async get(path) {
      return (await page(`${apiUrl}${path}`)).data;
    },
    async getAll(path, key) {
      const items = [];
      /** @type {string | null} */
      let url = `${apiUrl}${path}${path.includes('?') ? '&' : '?'}per_page=100`;
      while (url) {
        const { data, next } = await page(url);
        const list = key ? /** @type {Record<string, unknown>} */ (data)[key] : data;
        if (!Array.isArray(list)) throw new Error(`Expected a list from ${url}`);
        items.push(...list);
        url = next;
      }
      return items;
    },
  };
}

/**
 * Fetches everything classify() reads for one PR.
 *
 * @param {import('./pr-state.d.mts').Client} api
 * @param {string} repo "owner/name"
 * @param {number} number
 * @returns {Promise<import('./pr-state.d.mts').Snapshot>}
 */
export async function collect(api, repo, number) {
  const base = `/repos/${repo}`;
  const pull = /** @type {import('./pr-state.d.mts').Pull} */ (
    await api.get(`${base}/pulls/${number}`)
  );
  const sha = pull.head.sha;
  const [headCommit, checkRuns, statuses, issueComments, reviews, reviewComments, reactions] =
    await Promise.all([
      api.get(`${base}/git/commits/${sha}`),
      api.getAll(`${base}/commits/${sha}/check-runs`, 'check_runs'),
      api.getAll(`${base}/commits/${sha}/statuses`),
      api.getAll(`${base}/issues/${number}/comments`),
      api.getAll(`${base}/pulls/${number}/reviews`),
      api.getAll(`${base}/pulls/${number}/comments`),
      api.getAll(`${base}/issues/${number}/reactions`),
    ]);
  return /** @type {import('./pr-state.d.mts').Snapshot} */ ({
    pull,
    headCommit,
    checkRuns,
    statuses,
    issueComments,
    reviews,
    reviewComments,
    reactions,
  });
}
