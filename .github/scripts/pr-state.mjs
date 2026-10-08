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
//   - CodeRabbit sets a "CodeRabbit" commit status on each commit it looks at. "Review rate
//     limited" is a success status, so it must not count as a passing check or a review. The
//     PR doesn't wait for a rate-limited CodeRabbit, and doesn't ask it again for that commit.
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
  const start = Date.parse(clockStart(snapshot));
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
  if (reviewedHead || finished || /review completed/i.test(status?.description ?? '')) {
    return { state: 'done', detail: `CodeRabbit reviewed ${short}` };
  }
  // Don't wait for a rate-limited CodeRabbit, and don't ask it again for this commit. It's rate
  // limited when its status since the last request says so, or when it refused the last request
  // for that reason. CodeRabbit reviews the next push if its limit allows.
  // A pending status means that it's reviewing, even after it refused a request.
  const lastAsked = asked[asked.length - 1]?.created_at;
  const limitedStatus =
    status?.state === 'success' &&
    /rate limit/i.test(status.description ?? '') &&
    (!lastAsked || byTime(status.created_at, lastAsked) >= 0);
  const limitedReply =
    status?.state !== 'pending' &&
    /action not completed/i.test(reply?.body ?? '') &&
    /rate limit/i.test(reply?.body ?? '');
  if (limitedStatus || limitedReply) {
    return {
      state: 'rate-limited',
      detail: `CodeRabbit was rate limited on ${short}, so the PR doesn't wait for it`,
    };
  }
  if (now - start >= BOT_MAX_WAIT) {
    return {
      state: 'gave-up',
      detail: `CodeRabbit hasn't reviewed ${short} in the 2 hours it has had`,
    };
  }
  if (status?.state === 'pending') {
    return { state: 'running', detail: `CodeRabbit is reviewing ${short}` };
  }
  if (/action not completed/i.test(reply?.body ?? '')) {
    // AGENTS.md asks each bot once per commit, so wait out the two hours.
    const reason = /<\/summary>\s*([^<\s][^\n]*)/i.exec(reply?.body ?? '')?.[1]?.trim();
    return {
      state: 'refused',
      detail: `CodeRabbit refused the review request${reason ? `: ${reason}` : ''}`,
      until: after(start, BOT_MAX_WAIT),
    };
  }
  if (asked.length > 0) {
    return {
      state: 'requested',
      detail: `Asked at ${asked[0].created_at} for a review of ${short}`,
      until: after(start, BOT_MAX_WAIT),
    };
  }
  if (
    status?.state === 'success' &&
    /disabled for this base branch/i.test(status.description ?? '')
  ) {
    // A PR on another PR's branch. CodeRabbit reviews it only when asked.
    return {
      state: 'not-requested',
      detail: "CodeRabbit doesn't review PRs on this base branch unless asked",
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
  if (now - start < BOT_START_WAIT) {
    return {
      state: 'pending',
      detail: `CodeRabbit hasn't started on ${short}`,
      until: after(start, BOT_START_WAIT),
    };
  }
  return {
    state: 'not-requested',
    detail: `CodeRabbit hasn't started on ${short} 30 minutes after it could start`,
    action: 'Post `@coderabbitai review`',
  };
}

/**
 * Review threads that Codex or CodeRabbit started and no person has replied to. AGENTS.md asks
 * agents to reply to each of them.
 *
 * @param {import('./pr-state.d.mts').ReviewComment[]} comments
 * @returns {import('./pr-state.d.mts').ReviewComment[]}
 */
export function unansweredBotThreads(comments) {
  const answered = new Set(
    comments.filter(c => !byBot(c) && c.in_reply_to_id).map(c => c.in_reply_to_id)
  );
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
 * Codex and CodeRabbit reviews since the push that put comments in the review body instead of
 * in a thread ("Outside diff range comments"), with no later comment or review from a person.
 * A comment that only asks a bot to review isn't an answer.
 *
 * @param {import('./pr-state.d.mts').Snapshot} snapshot
 * @returns {import('./pr-state.d.mts').Review[]}
 */
export function unansweredReviewBodies(snapshot) {
  const pushed = pushedAt(snapshot);
  const answers = [
    ...snapshot.issueComments
      .filter(c => !byBot(c) && !BOT_COMMAND.test(c.body ?? ''))
      .map(c => c.created_at),
    ...snapshot.reviews.filter(r => !byBot(r) && r.submitted_at).map(r => r.submitted_at ?? ''),
  ];
  return snapshot.reviews.filter(
    r =>
      byReviewBot(r) &&
      r.submitted_at &&
      byTime(r.submitted_at, pushed) >= 0 &&
      /outside diff range comments \(\d+\)/i.test(r.body ?? '') &&
      !answers.some(t => byTime(t, r.submitted_at ?? '') > 0)
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
 *   round in AGENTS.md, a bot that hasn't reviewed isn't something to ask: the PR waits for it
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
  const coderabbit = closed || pull.draft ? skipped : unasked(coderabbitState(snapshot, now));
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
    reasons.push(`${who(review)} put comments outside the diff in ${review.html_url}`);
  }
  for (const review of changesRequested(snapshot.reviews)) {
    reasons.push(`${who(review)} requested changes: ${review.html_url}`);
  }
  if (pull.mergeable_state === 'dirty') reasons.push('The PR has a merge conflict with its base');
  for (const bot of [codex, coderabbit]) {
    if (bot.state === 'not-requested') reasons.push(bot.detail);
    if (bot.action) actions.push(bot.action);
    if (bot.state === 'gave-up' || bot.state === 'rate-limited') notes.push(bot.detail);
    if (['pending', 'running', 'requested', 'refused'].includes(bot.state)) {
      const until = bot.until ? ` (until ${bot.until})` : '';
      waits.push(`${bot.detail}${until}`);
    }
  }
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
