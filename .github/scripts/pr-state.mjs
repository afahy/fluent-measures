// Works out what a pull request is waiting on, from GitHub REST API responses. collect() fetches
// the responses and classify() reads them, so tests can pass recorded responses instead.
// pr-status.mjs prints the result. GraphQL is blocked in Claude Code cloud sessions, so this
// uses only the REST API.
//
// The rules come from AGENTS.md ("Handle findings and CI" and "Merge your own PR") and from
// mistakes that watchers made on earlier PRs (AFA-98):
//   - Every check is for the PR's current head commit. A 👍 or a review of an earlier commit
//     doesn't count.
//   - Codex is done when it reviews the head commit, comments that it found no major issues in
//     it, or its summary comment says the review of the head commit is Completed. 👀 means it's
//     still running.
//   - A PR never waits for CodeRabbit, and pr:status never asks it to review (AFA-138): it
//     reviews in time or it doesn't. Its threads, its comments outside the diff and its requested
//     changes still need the agent, and its state for the head commit is a note.
//   - CodeRabbit sets a "CodeRabbit" commit status on each commit it looks at. "Review rate
//     limited" is a success status, so it must not count as a passing check or a review.
//   - CodeRabbit's summary and rate-limit comments also name a commit range, but only its
//     reviews mean that it reviewed the commit.
//   - Bots name commits by short SHAs, so a SHA matches any prefix of 7 or more characters.
//   - A commit's own date can be hours before its push, and bots and CI start only once the PR
//     is open and ready for review. Timers count from the latest of those times.

/** The bots whose findings AGENTS.md asks agents to act on. */
export const CODEX = 'chatgpt-codex-connector[bot]';
export const CODERABBIT = 'coderabbitai[bot]';
const REVIEW_BOTS = new Set([CODEX, CODERABBIT]);

/** The commit status that pr-status.yml sets. It reports this script's answer, so it isn't CI. */
export const OWN_STATUS = 'pr-status';
/** pr-status.yml's job, whose check run is on the head commit while it sets that status. */
export const OWN_CHECK = 'Set the PR status';

const MINUTE = 60 * 1000;
/** How long a bot gets to start before the agent asks it (AGENTS.md). */
export const BOT_START_WAIT = 30 * MINUTE;
/** How long to wait for a bot in all (AGENTS.md: "Wait at most two hours for a bot"). */
export const BOT_MAX_WAIT = 120 * MINUTE;
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
 * @param {{ user?: { login?: string } | null }} item
 * @returns {boolean}
 */
function byReviewBot(item) {
  return REVIEW_BOTS.has(item.user?.login ?? '');
}

/**
 * The login of whoever wrote an item. GitHub gives a deleted account's items a null user.
 *
 * @param {{ user?: { login?: string } | null }} item
 * @returns {string}
 */
function who(item) {
  return item.user?.login ?? 'a deleted account';
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
 * @param {string[]} times
 * @returns {string}
 */
function latest(times) {
  return [...times].sort(byTime)[times.length - 1];
}

/**
 * When the head commit reached GitHub: the push in the branch's activity, else the first check
 * run on the commit, else the commit's own date.
 *
 * @param {import('./pr-state.d.mts').Snapshot} snapshot
 * @returns {string}
 */
export function pushedAt(snapshot) {
  const head = snapshot.pull.head.sha;
  const push = snapshot.pushes.find(p => p.after === head);
  if (push) return push.timestamp;
  const starts = snapshot.checkRuns
    .map(run => run.started_at)
    .filter(Boolean)
    .sort(byTime);
  return starts[0] ?? snapshot.headCommit.committer.date;
}

/**
 * When CI and the bots could start on the head commit: the latest of the push, the PR's
 * creation, and its last move from draft to ready for review.
 *
 * @param {import('./pr-state.d.mts').Snapshot} snapshot
 * @returns {string}
 */
export function clockStart(snapshot) {
  const ready = snapshot.events.filter(e => e.event === 'ready_for_review').map(e => e.created_at);
  return latest([pushedAt(snapshot), snapshot.pull.created_at, ...ready]);
}

/**
 * Sums up CI on the head commit: the latest run of each check, and the latest status for each
 * context other than CodeRabbit's. pr-status.yml's own status and check aren't CI either. A
 * workflow that runs again, for example when the PR's title is edited, starts a new check suite,
 * so a check's latest run is its latest in any suite.
 *
 * @param {import('./pr-state.d.mts').CheckRun[]} checkRuns
 * @param {import('./pr-state.d.mts').CommitStatus[]} statuses
 * @returns {import('./pr-state.d.mts').CiSummary}
 */
export function ciSummary(checkRuns, statuses) {
  /** @type {Map<string, import('./pr-state.d.mts').CheckRun>} */
  const runs = new Map();
  for (const run of checkRuns) {
    if (run.name === OWN_CHECK) continue;
    const key = `${run.app?.slug ?? ''}\u0000${run.name}`;
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

/** A comment that only asks a bot to do something, such as "Agent: @codex review". */
const BOT_COMMAND = /^\s*(?:agent:\s*)?@(?:codex|coderabbitai)\s+\S+[\s.]*$/i;

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
 * @param {number} start
 * @param {number} wait
 * @returns {string}
 */
function after(start, wait) {
  return new Date(start + wait).toISOString();
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
  const short = head.slice(0, 7);
  const pushed = pushedAt(snapshot);
  const start = Date.parse(clockStart(snapshot));
  if (snapshot.reviews.some(r => r.user?.login === CODEX && shaMatches(r.commit_id, head))) {
    return { state: 'done', detail: `Codex reviewed ${short} and left comments` };
  }
  // With no findings, Codex may instead comment "Codex Review: Didn't find any major issues"
  // with a "Reviewed commit" line.
  const clean = snapshot.issueComments.some(
    c =>
      c.user?.login === CODEX &&
      shaMatches(/Reviewed commit:\**\s*`([0-9a-f]{7,40})`/i.exec(c.body ?? '')?.[1], head)
  );
  if (clean) return { state: 'done', detail: `Codex reviewed ${short} and found no major issues` };
  const summary = snapshot.issueComments.find(
    c => c.user?.login === CODEX && (c.body ?? '').includes('codex-pull-request-review-summary')
  );
  const row = codexSummaryRows(summary?.body ?? '').find(r => /code review/i.test(r.review));
  const ofHead = row && shaMatches(row.commit, head);
  if (ofHead && /completed/i.test(row.status)) {
    return { state: 'done', detail: `Codex completed its review of ${short}` };
  }
  // Codex reacts 👍 when its reviews finish with no findings. The reaction is on the PR, not a
  // commit, so only one from after the push is about the head commit.
  const thumbs = snapshot.reactions.some(
    r => r.user?.login === CODEX && r.content === '+1' && byTime(r.created_at, pushed) >= 0
  );
  if (thumbs) return { state: 'done', detail: `Codex reacted 👍 after ${short} was pushed` };
  const last = ofHead
    ? `; its review of ${short} ended as ${row.status}`
    : row?.commit
      ? `; its last review was of ${row.commit}`
      : '';
  if (now - start >= BOT_MAX_WAIT) {
    return {
      state: 'gave-up',
      detail: `Codex hasn't reviewed ${short} in the 2 hours it has had${last}`,
    };
  }
  if (ofHead && /running|queued|pending|progress/i.test(row.status)) {
    return { state: 'running', detail: `Codex's review of ${short} is ${row.status}` };
  }
  const eyes = snapshot.reactions.some(
    r => r.user?.login === CODEX && r.content === 'eyes' && byTime(r.created_at, pushed) >= 0
  );
  if (eyes) return { state: 'running', detail: 'Codex is reviewing (👀)' };
  const asked = requests(snapshot.issueComments, /@codex\s+review\b/i, pushed);
  if (asked.length > 0) {
    return {
      state: 'requested',
      detail: `Asked at ${asked[0].created_at} for a review of ${short}${last}`,
      until: after(start, BOT_MAX_WAIT),
    };
  }
  if (now - start < BOT_START_WAIT) {
    return {
      state: 'pending',
      detail: `Codex hasn't started on ${short}${last}`,
      until: after(start, BOT_START_WAIT),
    };
  }
  return {
    state: 'not-requested',
    detail: `Codex hasn't reviewed ${short} 30 minutes after it could start${last}`,
    action: 'Post `@codex review`',
  };
}

/**
 * CodeRabbit's state for the head commit. A PR doesn't wait for CodeRabbit (AFA-138), so the
 * state only gives the note that tells the agent what CodeRabbit did.
 *
 * @param {import('./pr-state.d.mts').Snapshot} snapshot
 * @returns {import('./pr-state.d.mts').BotState}
 */
export function coderabbitState(snapshot) {
  const head = snapshot.pull.head.sha;
  const short = head.slice(0, 7);
  const pushed = pushedAt(snapshot);
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
  const asked = requests(snapshot.issueComments, /@coderabbitai\s+review\b/i, pushed);
  // CodeRabbit answers a request with "Action performed" and edits it to "Review finished"
  // when it's done, or with "Action not completed" when it won't review.
  const reply = asked.length
    ? snapshot.issueComments
        .filter(
          c =>
            c.user?.login === CODERABBIT &&
            /action (performed|not completed)/i.test(c.body ?? '') &&
            byTime(c.created_at, asked[asked.length - 1].created_at) >= 0
        )
        .sort((a, b) => byTime(b.created_at, a.created_at))[0]
    : undefined;
  const finished =
    /action performed/i.test(reply?.body ?? '') && /review finished/i.test(reply?.body ?? '');
  const refused = /action not completed/i.test(reply?.body ?? '');
  if (reviewedHead || finished || /review completed/i.test(status?.description ?? '')) {
    return { state: 'done', detail: `CodeRabbit reviewed ${short}` };
  }
  // It's rate limited when its status since the last request says so, or when it refused the
  // last request for that reason. A status after the refusal wins: a pending one means it's
  // reviewing. CodeRabbit edits the refusal's text into its reply a few seconds after it creates
  // the reply, so the edit time counts (AFA-137).
  const lastAsked = asked[asked.length - 1]?.created_at;
  const limitedStatus =
    status?.state === 'success' &&
    /rate limit/i.test(status.description ?? '') &&
    (!lastAsked || byTime(status.created_at, lastAsked) >= 0);
  const limitedReply =
    reply !== undefined &&
    refused &&
    /rate limit/i.test(reply.body ?? '') &&
    (!status || byTime(reply.updated_at, status.created_at) >= 0);
  if (limitedStatus || limitedReply) {
    return { state: 'rate-limited', detail: `CodeRabbit was rate limited on ${short}` };
  }
  if (status?.state === 'pending') {
    return { state: 'running', detail: `CodeRabbit is reviewing ${short}` };
  }
  if (refused) {
    const reason = /<\/summary>\s*([^<\s][^\n]*)/i.exec(reply?.body ?? '')?.[1]?.trim();
    return {
      state: 'refused',
      detail: `CodeRabbit refused the review request${reason ? `: ${reason}` : ''}`,
    };
  }
  if (asked.length > 0) {
    return {
      state: 'requested',
      detail: `CodeRabbit was asked at ${asked[0].created_at} for a review of ${short}`,
    };
  }
  if (
    status?.state === 'success' &&
    /disabled for this base branch/i.test(status.description ?? '')
  ) {
    // A PR on another PR's branch. CodeRabbit doesn't review it, and AGENTS.md says not to ask.
    return {
      state: 'skipped',
      detail: "CodeRabbit doesn't review PRs on this base branch",
    };
  }
  if (status?.state === 'success') {
    // For example "Review skipped", when every changed file is in an ignored path.
    return { state: 'done', detail: `CodeRabbit: ${status.description ?? 'success'}` };
  }
  if (status) {
    return {
      state: 'failed',
      detail: `CodeRabbit's review of ${short} ended with "${status.description ?? status.state}"`,
    };
  }
  return { state: 'pending', detail: `CodeRabbit hasn't reviewed ${short}` };
}

/**
 * The IDs of the review comments that start a thread with a person's reply in it.
 *
 * @param {import('./pr-state.d.mts').ReviewComment[]} comments
 * @returns {Set<number | null | undefined>}
 */
function repliedThreads(comments) {
  return new Set(comments.filter(c => !byBot(c) && c.in_reply_to_id).map(c => c.in_reply_to_id));
}

/**
 * Review threads that Codex or CodeRabbit started and no person has replied to. AGENTS.md asks
 * agents to reply to each of them.
 *
 * @param {import('./pr-state.d.mts').ReviewComment[]} comments
 * @returns {import('./pr-state.d.mts').ReviewComment[]}
 */
export function unansweredBotThreads(comments) {
  const answered = repliedThreads(comments);
  return comments
    .filter(c => !c.in_reply_to_id && byReviewBot(c) && !answered.has(c.id))
    .sort((a, b) => byTime(a.created_at, b.created_at));
}

/**
 * Replies from Codex or CodeRabbit that came after a person's last reply in the same thread. A
 * bot often answers a fix with a thank-you, so these are worth reading but don't block the PR.
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
    if (byReviewBot(last) && thread.some(c => !byBot(c))) followUps.push(last);
  }
  return followUps.sort((a, b) => byTime(a.created_at, b.created_at));
}

/**
 * Codex and CodeRabbit reviews since the push that `test` matches, with no answer from a person.
 * An answer is a later PR comment or review from a person that links to the review, with
 * `#pullrequestreview-<id>` (AFA-144). Any other comment can be about something else, so it
 * doesn't answer the review. A comment that is edited after the review counts from its edit.
 * A comment that only asks a bot to review isn't an answer.
 *
 * @param {import('./pr-state.d.mts').Snapshot} snapshot
 * @param {(review: import('./pr-state.d.mts').Review) => boolean} test
 * @returns {import('./pr-state.d.mts').Review[]}
 */
function unansweredBotReviews(snapshot, test) {
  const pushed = pushedAt(snapshot);
  const answers = [
    ...snapshot.issueComments
      .filter(c => !byBot(c) && !BOT_COMMAND.test(c.body ?? ''))
      .map(c => ({ time: c.updated_at ?? c.created_at, body: c.body ?? '' })),
    ...snapshot.reviews
      .filter(r => !byBot(r) && r.submitted_at)
      .map(r => ({ time: r.submitted_at ?? '', body: r.body ?? '' })),
  ];
  return snapshot.reviews.filter(r => {
    if (!byReviewBot(r) || !r.submitted_at || byTime(r.submitted_at, pushed) < 0 || !test(r)) {
      return false;
    }
    const link = new RegExp(`#pullrequestreview-${r.id}(?!\\d)`);
    return !answers.some(a => byTime(a.time, r.submitted_at ?? '') > 0 && link.test(a.body));
  });
}

/**
 * Codex and CodeRabbit reviews since the push that put comments in the review body instead of
 * in a thread ("Outside diff range comments"), with no comment from a person that links to them.
 * A reply in one of the review's threads is about that thread, so it doesn't count.
 *
 * @param {import('./pr-state.d.mts').Snapshot} snapshot
 * @returns {import('./pr-state.d.mts').Review[]}
 */
export function unansweredReviewBodies(snapshot) {
  return unansweredBotReviews(snapshot, r =>
    /outside diff range comments \(\d+\)/i.test(r.body ?? '')
  );
}

/**
 * Codex and CodeRabbit reviews since the push that request changes, with no answer from a
 * person. An answer clears it, as for comments outside the diff (AFA-138), because the bot may
 * never review again. A person's reply in one of the review's threads answers it too.
 * unansweredBotThreads lists each of the review's threads that has no reply.
 *
 * @param {import('./pr-state.d.mts').Snapshot} snapshot
 * @returns {import('./pr-state.d.mts').Review[]}
 */
export function botChangeRequests(snapshot) {
  const replied = repliedThreads(snapshot.reviewComments);
  return unansweredBotReviews(
    snapshot,
    r =>
      r.state === 'CHANGES_REQUESTED' &&
      !snapshot.reviewComments.some(c => c.pull_request_review_id === r.id && replied.has(c.id))
  );
}

/**
 * Bot output since the push that has no thread to reply in: CodeRabbit's nitpick sections, and
 * Codex or CodeRabbit comments other than their summaries, rate-limit notes and replies to
 * requests. These are worth reading but don't block the PR.
 *
 * @param {import('./pr-state.d.mts').Snapshot} snapshot
 * @returns {string[]}
 */
export function botOutputSincePush(snapshot) {
  const pushed = pushedAt(snapshot);
  /** @type {string[]} */
  const notes = [];
  for (const review of snapshot.reviews) {
    if (!byReviewBot(review) || byTime(review.submitted_at ?? '', pushed) < 0) continue;
    const count = /nitpick comments \((\d+)\)/i.exec(review.body ?? '')?.[1];
    if (count) notes.push(`${who(review)} left ${count} nitpick comments in ${review.html_url}`);
  }
  const routine =
    /codex-pull-request-review-summary|summarize by coderabbit|auto-generated reply by coderabbit|rate limited by coderabbit/i;
  for (const comment of snapshot.issueComments) {
    if (!byReviewBot(comment) || byTime(comment.created_at, pushed) < 0) continue;
    if (routine.test(comment.body ?? '')) continue;
    notes.push(`${who(comment)} commented: ${comment.html_url}`);
  }
  return notes;
}

/**
 * Each person's latest review that requests changes.
 *
 * @param {import('./pr-state.d.mts').Review[]} reviews
 * @returns {import('./pr-state.d.mts').Review[]}
 */
function changesRequested(reviews) {
  /** @type {Map<string, import('./pr-state.d.mts').Review>} */
  const latestByUser = new Map();
  for (const review of reviews) {
    if (byBot(review) || !review.submitted_at) continue;
    if (!['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state)) continue;
    const login = who(review);
    const seen = latestByUser.get(login);
    if (!seen || byTime(review.submitted_at, seen.submitted_at ?? '') > 0) {
      latestByUser.set(login, review);
    }
  }
  return [...latestByUser.values()].filter(r => r.state === 'CHANGES_REQUESTED');
}

/**
 * Decides what a PR is waiting on.
 *
 * @param {import('./pr-state.d.mts').Snapshot} snapshot
 * @param {number} [now] Milliseconds since the epoch.
 * @param {{ requests?: boolean }} [options] With `requests: false`, as after the third review
 *   round in AGENTS.md, a Codex that hasn't reviewed isn't something to ask: the PR waits for it
 *   until its 2 hours are up.
 * @returns {import('./pr-state.d.mts').PrStatus}
 */
export function classify(snapshot, now = Date.now(), { requests = true } = {}) {
  const { pull } = snapshot;
  const head = pull.head.sha;
  const pushed = pushedAt(snapshot);
  const start = clockStart(snapshot);
  const ci = ciSummary(snapshot.checkRuns, snapshot.statuses);
  /** @type {string[]} */
  const reasons = [];
  /** @type {string[]} */
  const actions = [];
  /** @type {string[]} */
  const notes = [];
  /** @type {string[]} */
  const waits = [];
  const closed = Boolean(pull.merged || pull.merged_at) || pull.state === 'closed';
  /** @type {import('./pr-state.d.mts').BotState} */
  const skipped = closed
    ? { state: 'skipped', detail: 'The PR is closed' }
    : { state: 'skipped', detail: "The bots don't review drafts" };
  /** @param {import('./pr-state.d.mts').BotState} bot */
  const unasked = bot =>
    !requests && bot.state === 'not-requested'
      ? {
          state: /** @type {const} */ ('pending'),
          detail: `${bot.detail}, and the review rounds are used up`,
          until: after(Date.parse(start), BOT_MAX_WAIT),
        }
      : bot;
  const codex = closed || pull.draft ? skipped : unasked(codexState(snapshot, now));
  const coderabbit = closed || pull.draft ? skipped : coderabbitState(snapshot);
  const result = (/** @type {import('./pr-state.d.mts').PrState} */ state) => ({
    pr: pull.number,
    title: pull.title,
    url: pull.html_url,
    state,
    head,
    pushedAt: pushed,
    mergeableState: pull.mergeable_state ?? null,
    reasons,
    actions,
    notes,
    waits,
    ci,
    codex,
    coderabbit,
  });

  // A closed PR still lists unanswered threads, for the final comment check after a merge.
  for (const thread of unansweredBotThreads(snapshot.reviewComments)) {
    reasons.push(`${who(thread)} left a thread with no reply: ${thread.html_url}`);
  }
  for (const reply of botFollowUps(snapshot.reviewComments)) {
    notes.push(`${who(reply)} replied after your reply: ${reply.html_url}`);
  }
  notes.push(...botOutputSincePush(snapshot));
  if (pull.merged || pull.merged_at) return result('merged');
  if (pull.state === 'closed') return result('closed');

  if (ci.failed.length > 0) reasons.push(`CI failed: ${ci.failed.join(', ')}`);
  if (ci.passed.length + ci.pending.length + ci.failed.length === 0) {
    if (now - Date.parse(start) >= CI_START_WAIT) {
      reasons.push(`No CI ran on ${head.slice(0, 7)} in the 30 minutes after it could start`);
    } else {
      waits.push(`CI hasn't started on ${head.slice(0, 7)}`);
    }
  }
  for (const review of unansweredReviewBodies(snapshot)) {
    reasons.push(
      `${who(review)} put comments outside the diff in ${review.html_url}. Answer in a PR comment that links to it.`
    );
  }
  for (const review of botChangeRequests(snapshot)) {
    reasons.push(
      `${who(review)} requested changes: ${review.html_url}. Answer in its threads or in a PR comment that links to it.`
    );
  }
  for (const review of changesRequested(snapshot.reviews)) {
    reasons.push(`${who(review)} requested changes: ${review.html_url}`);
  }
  if (pull.mergeable_state === 'dirty') reasons.push('The PR has a merge conflict with its base');
  if (codex.state === 'not-requested') reasons.push(codex.detail);
  if (codex.action) actions.push(codex.action);
  if (codex.state === 'gave-up') notes.push(codex.detail);
  if (['pending', 'running', 'requested'].includes(codex.state)) {
    const until = codex.until ? ` (until ${codex.until})` : '';
    waits.push(`${codex.detail}${until}`);
  }
  // CodeRabbit adds no wait, reason or request (AFA-138). Its review is optional, so the note
  // only says what it did with the head commit, such as a rate limit (AFA-151).
  if (!pull.draft && coderabbit.state !== 'done') notes.push(coderabbit.detail);
  if (ci.pending.length > 0) waits.push(`CI is running: ${ci.pending.join(', ')}`);
  if (!pull.mergeable_state || pull.mergeable_state === 'unknown') {
    waits.push('GitHub is still working out whether the PR can merge');
  }
  if (reasons.length > 0) return result('needs-agent');
  // Only a person takes a PR out of draft, so running CI doesn't make a draft wait on the agent.
  if (pull.draft) {
    reasons.push('The PR is a draft');
    return result('waiting-human');
  }
  if (waits.length > 0) return result('waiting');

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
  const { state, head, reasons, actions } = status;
  // CodeRabbit's progress needs no action (AFA-138), so its note doesn't count as news.
  const notes = status.notes.filter(note => note !== status.coderabbit.detail);
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
    /**
     * Runs one step of the request. A network error can pass, so another try can help, also when
     * the connection drops while the body is read (AFA-147).
     *
     * @template T
     * @param {() => Promise<T>} step
     * @returns {Promise<T>}
     */
    async function answer(step) {
      try {
        return await step();
      } catch (error) {
        const message = `GitHub didn't answer for ${url}: ${/** @type {Error} */ (error).message}`;
        throw Object.assign(new Error(message), { retryAt: null, retryable: true, refused: false });
      }
    }
    const response = await answer(() => get(url, { headers }));
    if (response.status === 304 && cached) return cached;
    if (!response.ok) {
      const { status } = response;
      const text = (await answer(() => response.text())).slice(0, 200);
      // GitHub sends these headers with every answer, but only a 403 or a 429 is a rate limit.
      const remaining = response.headers.get('x-ratelimit-remaining');
      const reset = response.headers.get('x-ratelimit-reset');
      const limited = (status === 403 || status === 429) && remaining === '0' && reset;
      // A secondary rate limit is a 429, or a 403 that says so or gives a Retry-After. That header
      // gives the wait in seconds or as a date. Without it, GitHub's docs say to wait a minute.
      const after = response.headers.get('retry-after');
      const secondary =
        !limited &&
        (status === 429 || (status === 403 && (after !== null || /rate limit/i.test(text))));
      const afterAt =
        after === null
          ? NaN
          : /^\s*\d+\s*$/.test(after)
            ? Date.now() + Number(after) * 1000
            : Date.parse(after);
      const retryAt = limited
        ? Number(reset) * 1000
        : secondary
          ? Number.isFinite(afterAt)
            ? afterAt
            : Date.now() + 60_000
          : null;
      const error = new Error(
        limited
          ? `GitHub's rate limit is used up until ${new Date(Number(reset) * 1000).toISOString()}`
          : `GitHub answered ${status} for ${url}: ${text}`
      );
      // A rate limit or a server error can pass, so another try can help. It can't help a token
      // that GitHub refuses, a 401 or another 403, or a path that isn't there (AFA-147).
      throw Object.assign(error, {
        status,
        retryAt,
        retryable: retryAt !== null || status >= 500,
        refused: retryAt === null && (status === 401 || status === 403),
      });
    }
    const next = /<([^>]+)>;\s*rel="next"/.exec(response.headers.get('link') ?? '')?.[1] ?? null;
    const result = { data: JSON.parse(await answer(() => response.text())), next };
    const etag = response.headers.get('etag');
    if (etag) cache.set(url, { etag, ...result });
    else cache.delete(url);
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
  const { sha, ref } = pull.head;
  // The branch's pushes. A deleted fork has no repository to read them from.
  const headRepo = pull.head.repo?.full_name;
  const branch = encodeURIComponent(ref);
  const [
    headCommit,
    pushes,
    events,
    checkRuns,
    statuses,
    issueComments,
    reviews,
    reviewComments,
    reactions,
  ] = await Promise.all([
    api.get(`${base}/git/commits/${sha}`),
    headRepo ? api.get(`/repos/${headRepo}/activity?ref=${branch}&per_page=100`) : [],
    api.getAll(`${base}/issues/${number}/events`),
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
    pushes,
    events,
    checkRuns,
    statuses,
    issueComments,
    reviews,
    reviewComments,
    reactions,
  });
}
