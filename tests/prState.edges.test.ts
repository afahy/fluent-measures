import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  botFollowUps,
  botOutputSincePush,
  ciSummary,
  classify,
  clockStart,
  coderabbitState,
  codexState,
  codeownersPattern,
  codexSummaryRows,
  collect,
  createClient,
  digest,
  mostUrgent,
  ownedFiles,
  pushedAt,
  rateLimitResetAt,
  unansweredBotThreads,
  unansweredReviewBodies,
  type CheckRun,
  type IssueComment,
  type Review,
  type ReviewComment,
  type Snapshot,
} from '../.github/scripts/pr-state.mjs';

// Edge cases for pr-state.mjs. prState.test.ts covers the real PRs; these tests change one
// thing at a time in those snapshots, or use small made-up ones. Every expected value was
// worked out by hand. In pr-67 the branch was pushed at 14:43:10 and the PR opened at 14:51:34,
// so the bots' 30-minute and 2-hour clocks end at 15:21:34 and 16:51:34. In pr-66 the head was
// pushed at 15:00:44, after the PR opened, so they end at 15:30:44 and 17:00:44.

function fixture(name: string): Snapshot {
  return JSON.parse(readFileSync(`tests/fixtures/pr-status/${name}.json`, 'utf8'));
}

const at = (time: string): number => Date.parse(time);
const human = { login: 'afahy', type: 'User' };
const codexBot = { login: 'chatgpt-codex-connector[bot]', type: 'Bot' };
const rabbit = { login: 'coderabbitai[bot]', type: 'Bot' };
const pull67 = 'https://github.com/afahy/fluent-measures/pull/67';
const head67 = '318c1b7f27c418c6a53ecf1c3de26c32ea207cb0';

function comment(id: number, user: IssueComment['user'], body: string, time: string): IssueComment {
  return {
    id,
    user,
    body,
    created_at: time,
    updated_at: time,
    html_url: `${pull67}#issuecomment-${id}`,
  };
}

function threadComment(
  id: number,
  user: ReviewComment['user'],
  time: string,
  inReplyTo: number | null = null
): ReviewComment {
  return {
    id,
    user,
    in_reply_to_id: inReplyTo,
    created_at: time,
    html_url: `${pull67}#discussion_r${id}`,
  };
}

function review(
  id: number,
  user: Review['user'],
  state: string,
  body: string | null,
  time: string | null
): Review {
  return {
    id,
    user,
    state,
    body,
    commit_id: head67,
    submitted_at: time,
    html_url: `${pull67}#pullrequestreview-${id}`,
  };
}

/** #67 with CodeRabbit's status changed to a completed review, so only one thing differs. */
function reviewed67(): Snapshot {
  const snapshot = fixture('pr-67');
  snapshot.statuses.push({
    context: 'CodeRabbit',
    state: 'success',
    description: 'Review completed',
    created_at: '2026-10-07T15:55:00Z',
  });
  return snapshot;
}

describe('pushedAt and clockStart', () => {
  it("uses the branch's push, else the earliest check run that started, else the commit date", () => {
    const snapshot = fixture('pr-67');
    expect(pushedAt(snapshot)).toBe('2026-10-07T14:43:10Z');
    snapshot.pushes = [
      { activity_type: 'push', after: 'f00ba12', timestamp: '2026-10-07T14:00:00Z' },
    ];
    snapshot.checkRuns = [
      {
        id: 1,
        name: 'b',
        status: 'completed',
        conclusion: 'success',
        started_at: '2026-10-07T15:00:00Z',
      },
      { id: 2, name: 'a', status: 'queued', conclusion: null, started_at: null },
      {
        id: 3,
        name: 'c',
        status: 'completed',
        conclusion: 'success',
        started_at: '2026-10-07T14:55:00Z',
      },
    ];
    expect(pushedAt(snapshot)).toBe('2026-10-07T14:55:00Z');
    snapshot.checkRuns = [];
    expect(pushedAt(snapshot)).toBe('2026-10-07T14:40:06Z');
  });

  it('starts the clock at the latest of the push, the PR opening and its last ready for review', () => {
    const snapshot = fixture('pr-67');
    expect(clockStart(snapshot)).toBe('2026-10-07T14:51:34Z');
    snapshot.events.push(
      { event: 'ready_for_review', created_at: '2026-10-07T15:30:00Z' },
      { event: 'convert_to_draft', created_at: '2026-10-07T15:40:00Z' },
      { event: 'ready_for_review', created_at: '2026-10-07T15:20:00Z' }
    );
    expect(clockStart(snapshot)).toBe('2026-10-07T15:30:00Z');
    expect(clockStart(fixture('pr-66'))).toBe('2026-10-07T15:00:44Z');
  });
});

describe('ciSummary edges', () => {
  const run = (
    id: number,
    name: string,
    conclusion: string | null,
    app = 'github-actions'
  ): CheckRun => ({
    id,
    name,
    status: conclusion ? 'completed' : 'in_progress',
    conclusion,
    started_at: '2026-10-07T10:00:00Z',
    app: { slug: app },
  });

  it('keeps the newest run of a check from any suite, and keeps apps apart', () => {
    // A title edit runs "Validate commits and PR title" again in a new check suite.
    const summary = ciSummary(
      [run(1, 'title', 'failure'), run(2, 'title', 'success'), run(3, 'title', 'failure', 'other')],
      []
    );
    expect(summary).toEqual({ passed: ['title'], pending: [], failed: ['title'] });
  });

  it('fails every failing conclusion and sorts the names', () => {
    const conclusions = ['stale', 'startup_failure', 'action_required', 'failure'];
    const summary = ciSummary(
      conclusions.map((c, i) => run(i + 1, `${c}-check`, c)),
      []
    );
    expect(summary.failed).toEqual([
      'action_required-check',
      'failure-check',
      'stale-check',
      'startup_failure-check',
    ]);
  });

  it('takes the newest status of each context whatever the order', () => {
    const summary = ciSummary(
      [],
      [
        { context: 'b', state: 'success', description: null, created_at: '2026-10-07T10:05:00Z' },
        { context: 'b', state: 'failure', description: null, created_at: '2026-10-07T10:00:00Z' },
        { context: 'a', state: 'pending', description: null, created_at: '2026-10-07T10:00:00Z' },
        { context: 'c', state: 'error', description: null, created_at: '2026-10-07T10:00:00Z' },
      ]
    );
    expect(summary).toEqual({ passed: ['b'], pending: ['a'], failed: ['c'] });
  });
});

describe('codexSummaryRows edges', () => {
  it('skips a row whose status is not bold, and reads a row with no commit', () => {
    const body = [
      '| **Code Review** | Completed | `abc1234` | x |',
      '| **Security Review** | **Queued** | — | x |',
    ].join('\n');
    expect(codexSummaryRows(body)).toEqual([
      { review: 'Security Review', status: 'Queued', commit: null },
    ]);
  });
});

describe('rateLimitResetAt edges', () => {
  it('reads plural hours', () => {
    expect(rateLimitResetAt('available in 2 hours.', '2026-10-07T10:00:00Z')).toBe(
      '2026-10-07T12:00:00.000Z'
    );
  });
});

describe('bot threads', () => {
  it('counts only Codex and CodeRabbit threads, and only replies from people as answers', () => {
    const comments = [
      threadComment(5, rabbit, '2026-10-07T10:05:00Z'),
      // A [bot] login without a type is still a bot, so its reply isn't an answer.
      threadComment(6, { login: 'some-app[bot]' }, '2026-10-07T10:06:00Z', 5),
      threadComment(1, { login: 'chatgpt-codex-connector[bot]' }, '2026-10-07T10:01:00Z'),
      threadComment(2, null, '2026-10-07T10:02:00Z'),
      // CodeQL's alerts are checks, not review findings (AGENTS.md acts on the two bots).
      threadComment(
        3,
        { login: 'github-advanced-security[bot]', type: 'Bot' },
        '2026-10-07T10:03:00Z'
      ),
      threadComment(4, human, '2026-10-07T10:04:00Z'),
    ];
    expect(unansweredBotThreads(comments).map(c => c.id)).toEqual([1, 5]);
  });

  it("doesn't count a bot's reply as an answer", () => {
    const comments = [
      threadComment(1, rabbit, '2026-10-07T10:00:00Z'),
      threadComment(2, codexBot, '2026-10-07T10:01:00Z', 1),
    ];
    expect(unansweredBotThreads(comments).map(c => c.id)).toEqual([1]);
    expect(botFollowUps(comments)).toEqual([]);
  });

  it('orders replies by time, and lists follow-ups by time', () => {
    const comments = [
      threadComment(10, rabbit, '2026-10-07T10:00:00Z'),
      threadComment(12, rabbit, '2026-10-07T10:02:00Z', 10),
      threadComment(11, human, '2026-10-07T10:01:00Z', 10),
      threadComment(20, rabbit, '2026-10-07T09:00:00Z'),
      // In thread 20, a person replied last, after the bot's follow-up.
      threadComment(22, human, '2026-10-07T09:02:00Z', 20),
      threadComment(21, rabbit, '2026-10-07T09:01:00Z', 20),
      threadComment(30, codexBot, '2026-10-07T08:00:00Z'),
      threadComment(31, human, '2026-10-07T08:01:00Z', 30),
      threadComment(32, codexBot, '2026-10-07T08:02:00Z', 30),
      // CodeQL's follow-ups aren't listed either.
      threadComment(40, human, '2026-10-07T07:00:00Z'),
      threadComment(
        41,
        { login: 'github-advanced-security[bot]', type: 'Bot' },
        '2026-10-07T07:01:00Z',
        40
      ),
    ];
    expect(botFollowUps(comments).map(c => c.id)).toEqual([32, 12]);
  });
});

describe('codexState edges', () => {
  it('reports the full state for each stage of the wait', () => {
    const snapshot = fixture('pr-66');
    expect(codexState(snapshot, at('2026-10-07T15:20:00Z'))).toEqual({
      state: 'pending',
      detail: "Codex hasn't started on c7ad2f4; its last review was of 91a5d29",
      until: '2026-10-07T15:30:44.000Z',
    });
    expect(codexState(snapshot, at('2026-10-07T15:31:00Z'))).toEqual({
      state: 'not-requested',
      detail:
        "Codex hasn't reviewed c7ad2f4 30 minutes after it could start; its last review was of 91a5d29",
      action: 'Post `@codex review`',
    });
    expect(codexState(snapshot, at('2026-10-07T17:01:00Z'))).toEqual({
      state: 'gave-up',
      detail:
        "Codex hasn't reviewed c7ad2f4 in the 2 hours it has had; its last review was of 91a5d29",
    });
  });

  it("reads Codex's no-findings comment for the head as done, and its review of the head too", () => {
    const snapshot = fixture('pr-66');
    // The text of Codex's comment on #57, with the head's short SHA.
    snapshot.issueComments.push(
      comment(
        9,
        codexBot,
        "Codex Review: Didn't find any major issues. :rocket:\n\n**Reviewed commit:** `c7ad2f4b90`",
        '2026-10-07T15:20:00Z'
      )
    );
    expect(codexState(snapshot, at('2026-10-07T15:40:00Z'))).toEqual({
      state: 'done',
      detail: 'Codex reviewed c7ad2f4 and found no major issues',
    });
    snapshot.reviews.push({
      ...review(5, codexBot, 'COMMENTED', null, '2026-10-07T15:21:00Z'),
      commit_id: snapshot.pull.head.sha,
    });
    expect(codexState(snapshot, at('2026-10-07T15:40:00Z'))).toEqual({
      state: 'done',
      detail: 'Codex reviewed c7ad2f4 and left comments',
    });
  });

  it("ignores a no-findings comment for another commit, or from someone who isn't Codex", () => {
    const snapshot = fixture('pr-66');
    snapshot.issueComments.push(
      comment(9, codexBot, '**Reviewed commit:** `91a5d29c8f`', '2026-10-07T15:20:00Z'),
      comment(10, human, '**Reviewed commit:** `c7ad2f4b90`', '2026-10-07T15:21:00Z')
    );
    expect(codexState(snapshot, at('2026-10-07T15:40:00Z')).state).toBe('not-requested');
  });

  it("treats a failed review of the head as no review, and ignores a person's 👀", () => {
    const snapshot = fixture('pr-66');
    const summary = snapshot.issueComments.find(c => c.user?.login === codexBot.login)!;
    summary.body = summary
      .body!.replace('✅ **Completed**', '❌ **Failed**')
      .replace('`91a5d29`', '`c7ad2f4`');
    snapshot.reactions.push({ user: human, content: 'eyes', created_at: '2026-10-07T15:10:00Z' });
    expect(codexState(snapshot, at('2026-10-07T15:40:00Z'))).toEqual({
      state: 'not-requested',
      detail:
        "Codex hasn't reviewed c7ad2f4 30 minutes after it could start; its review of c7ad2f4 ended as Failed",
      action: 'Post `@codex review`',
    });
  });

  it('ignores a 👀 from before the push, which was for an earlier commit', () => {
    const snapshot = fixture('pr-66');
    snapshot.reactions.push({
      user: codexBot,
      content: 'eyes',
      created_at: '2026-10-07T15:00:43Z',
    });
    expect(codexState(snapshot, at('2026-10-07T15:40:00Z')).state).toBe('not-requested');
    snapshot.reactions.push({
      user: codexBot,
      content: 'eyes',
      created_at: '2026-10-07T15:00:44Z',
    });
    expect(codexState(snapshot, at('2026-10-07T15:40:00Z')).state).toBe('running');
  });

  it("gives up after 2 hours even if Codex's review never stops running", () => {
    const snapshot = fixture('pr-66');
    const summary = snapshot.issueComments.find(c => c.user?.login === codexBot.login)!;
    summary.body = summary
      .body!.replace('✅ **Completed**', '🔄 **Running**')
      .replace('`91a5d29`', '`c7ad2f4`');
    snapshot.reactions.push({
      user: codexBot,
      content: 'eyes',
      created_at: '2026-10-07T15:01:00Z',
    });
    expect(codexState(snapshot, at('2026-10-07T17:00:43Z')).state).toBe('running');
    expect(codexState(snapshot, at('2026-10-07T17:00:44Z'))).toEqual({
      state: 'gave-up',
      detail:
        "Codex hasn't reviewed c7ad2f4 in the 2 hours it has had; its review of c7ad2f4 ended as Running",
    });
  });

  it('counts only requests from people, made at or after the push, and names the first', () => {
    const snapshot = fixture('pr-66');
    snapshot.issueComments.push(
      // Codex's own comments quote the command.
      comment(1, codexBot, 'Comment "@codex review".', '2026-10-07T15:10:00Z'),
      comment(2, human, '@codex review', '2026-10-07T15:00:43Z')
    );
    expect(codexState(snapshot, at('2026-10-07T15:40:00Z')).state).toBe('not-requested');
    snapshot.issueComments.push(comment(4, human, '@codex  review', '2026-10-07T15:36:00Z'));
    expect(codexState(snapshot, at('2026-10-07T15:40:00Z')).detail).toBe(
      'Asked at 2026-10-07T15:36:00Z for a review of c7ad2f4; its last review was of 91a5d29'
    );
    snapshot.issueComments.push(comment(3, human, '@codex review', '2026-10-07T15:00:44Z'));
    expect(codexState(snapshot, at('2026-10-07T15:40:00Z')).detail).toBe(
      'Asked at 2026-10-07T15:00:44Z for a review of c7ad2f4; its last review was of 91a5d29'
    );
  });

  it('leaves out the last review when the summary names none', () => {
    const snapshot = fixture('pr-67');
    snapshot.issueComments = [];
    snapshot.reactions = [];
    expect(codexState(snapshot, at('2026-10-07T15:00:00Z'))).toEqual({
      state: 'pending',
      detail: "Codex hasn't started on 318c1b7",
      until: '2026-10-07T15:21:34.000Z',
    });
  });
});

describe('coderabbitState edges', () => {
  it("is running while its newest status is pending, and ignores other contexts' statuses", () => {
    const snapshot = fixture('pr-67');
    snapshot.statuses.push(
      {
        context: 'CodeRabbit',
        state: 'pending',
        description: 'Review in progress',
        created_at: '2026-10-07T15:50:00Z',
      },
      {
        context: 'deploy',
        state: 'success',
        description: 'Review completed',
        created_at: '2026-10-07T15:51:00Z',
      }
    );
    expect(coderabbitState(snapshot, at('2026-10-07T15:52:00Z'))).toEqual({
      state: 'running',
      detail: 'CodeRabbit is reviewing 318c1b7',
    });
    // A review that never finishes stops counting after 2 hours.
    expect(coderabbitState(snapshot, at('2026-10-07T16:51:34Z'))).toEqual({
      state: 'gave-up',
      detail: "CodeRabbit hasn't reviewed 318c1b7 in the 2 hours it has had",
    });
  });

  it('counts a review whose range ends at the head, but not one that ends elsewhere', () => {
    const snapshot = fixture('pr-67');
    snapshot.statuses = [];
    snapshot.reviews.push(
      review(
        1,
        rabbit,
        'COMMENTED',
        'between f5f23c3f06b08cb0f649017a729fe82c415aed90 and 91a5d29c8f62b5cbdececfcdb0a60e77d8209fc6.',
        '2026-10-07T15:00:00Z'
      )
    );
    expect(coderabbitState(snapshot, at('2026-10-07T15:00:00Z')).state).toBe('pending');
    snapshot.reviews.push(
      review(2, human, 'COMMENTED', `between f5f23c3 and ${head67}`, '2026-10-07T15:01:00Z')
    );
    expect(coderabbitState(snapshot, at('2026-10-07T15:00:00Z')).state).toBe('pending');
    snapshot.reviews.push(
      review(
        3,
        rabbit,
        'COMMENTED',
        `between f5f23c3 and 91a5d29, then between 91a5d29 and ${head67}.`,
        '2026-10-07T15:02:00Z'
      )
    );
    expect(coderabbitState(snapshot, at('2026-10-07T15:00:00Z'))).toEqual({
      state: 'done',
      detail: 'CodeRabbit reviewed 318c1b7',
    });
  });

  it('follows its answer to a request: triggered, finished or not completed', () => {
    const snapshot = fixture('pr-67');
    const answer = (text: string, time: string): IssueComment =>
      comment(
        2,
        rabbit,
        `<!-- This is an auto-generated reply by CodeRabbit -->\n<details>\n<summary>${text}</details>`,
        time
      );
    snapshot.issueComments.push(
      comment(1, human, '@coderabbitai review', '2026-10-07T15:50:00Z'),
      answer('✅ Action performed</summary>\n\nReview triggered.\n', '2026-10-07T15:50:08Z')
    );
    expect(coderabbitState(snapshot, at('2026-10-07T15:51:00Z'))).toEqual({
      state: 'requested',
      detail: 'Asked at 2026-10-07T15:50:00Z for a review of 318c1b7',
      until: '2026-10-07T16:51:34.000Z',
    });
    snapshot.issueComments.push(
      answer('✅ Action performed</summary>\n\nReview finished.\n', '2026-10-07T15:50:09Z')
    );
    expect(coderabbitState(snapshot, at('2026-10-07T15:51:00Z')).state).toBe('done');
    snapshot.issueComments.push(
      answer('⚠️ Action not completed</summary>', '2026-10-07T15:50:10Z')
    );
    expect(coderabbitState(snapshot, at('2026-10-07T15:51:00Z'))).toEqual({
      state: 'refused',
      detail: 'CodeRabbit refused the review request',
      until: '2026-10-07T16:51:34.000Z',
    });
  });

  it('ignores an answer from before the last request, or from someone else', () => {
    const snapshot = fixture('pr-67');
    snapshot.issueComments.push(
      comment(1, human, '@coderabbitai review', '2026-10-07T15:50:00Z'),
      comment(2, rabbit, 'Action not completed', '2026-10-07T15:49:00Z'),
      comment(3, human, 'Action not completed', '2026-10-07T15:51:00Z')
    );
    expect(coderabbitState(snapshot, at('2026-10-07T15:52:00Z')).state).toBe('requested');
  });

  it('uses the newest rate-limit note from CodeRabbit since the push, else assumes an hour', () => {
    const snapshot = fixture('pr-67');
    snapshot.issueComments.push(
      // Newer than the 57-minute note at 14:51:45, so this one counts.
      comment(
        5,
        rabbit,
        'rate limited by coderabbit.ai. Next included review available in 30 minutes.',
        '2026-10-07T14:51:50Z'
      ),
      // Not from CodeRabbit.
      comment(
        6,
        human,
        'rate limited by coderabbit.ai. Next included review available in 1 minute.',
        '2026-10-07T14:52:00Z'
      )
    );
    expect(coderabbitState(snapshot, at('2026-10-07T15:00:00Z')).until).toBe(
      '2026-10-07T15:21:50.000Z'
    );
    // Notes last edited before the 14:43:10 push are about earlier commits. Without one, the
    // limit ends an hour after the 14:51:46 status.
    snapshot.issueComments = snapshot.issueComments.map(c => ({
      ...c,
      updated_at: '2026-10-07T14:43:09Z',
    }));
    expect(coderabbitState(snapshot, at('2026-10-07T15:00:00Z'))).toEqual({
      state: 'rate-limited',
      detail: 'CodeRabbit is rate limited until 2026-10-07T15:51:46.000Z (assumed)',
      until: '2026-10-07T15:51:46.000Z',
    });
  });

  it('accepts a skipped review, and asks again after a failed one', () => {
    const snapshot = fixture('pr-67');
    snapshot.statuses = [
      {
        context: 'CodeRabbit',
        state: 'success',
        description: 'Review skipped',
        created_at: '2026-10-07T14:52:00Z',
      },
    ];
    expect(coderabbitState(snapshot, at('2026-10-07T15:00:00Z'))).toEqual({
      state: 'done',
      detail: 'CodeRabbit: Review skipped',
    });
    snapshot.statuses[0] = {
      ...snapshot.statuses[0],
      state: 'failure',
      description: 'Review failed',
    };
    expect(coderabbitState(snapshot, at('2026-10-07T15:00:00Z'))).toEqual({
      state: 'not-requested',
      detail: 'CodeRabbit\'s review of 318c1b7 ended with "Review failed"',
      action: 'Post `@coderabbitai review`',
    });
  });

  it('gives CodeRabbit 30 minutes to start, then asks it', () => {
    const snapshot = fixture('pr-67');
    snapshot.statuses = [];
    expect(coderabbitState(snapshot, at('2026-10-07T15:21:33Z'))).toEqual({
      state: 'pending',
      detail: "CodeRabbit hasn't started on 318c1b7",
      until: '2026-10-07T15:21:34.000Z',
    });
    expect(coderabbitState(snapshot, at('2026-10-07T15:21:34Z'))).toEqual({
      state: 'not-requested',
      detail: "CodeRabbit hasn't started on 318c1b7 30 minutes after it could start",
      action: 'Post `@coderabbitai review`',
    });
  });
});

describe('unansweredReviewBodies edges', () => {
  const outside = '<summary>⚠️ Outside diff range comments (12)</summary>';

  it('counts bot reviews from the push on, until a person comments or reviews later', () => {
    const snapshot = fixture('pr-67');
    snapshot.reviews.push(
      review(1, rabbit, 'COMMENTED', outside, '2026-10-07T14:43:10Z'),
      review(2, rabbit, 'COMMENTED', outside, '2026-10-07T14:43:09Z'),
      // A person's review at the same second neither counts nor answers.
      review(3, human, 'COMMENTED', outside, '2026-10-07T14:43:10Z'),
      review(4, rabbit, 'COMMENTED', outside, null),
      // Only Codex and CodeRabbit count.
      review(
        8,
        { login: 'github-advanced-security[bot]', type: 'Bot' },
        'COMMENTED',
        outside,
        '2026-10-07T14:44:00Z'
      )
    );
    expect(unansweredReviewBodies(snapshot).map(r => r.id)).toEqual([1]);
    snapshot.reviews.push(review(5, codexBot, 'COMMENTED', '', '2026-10-07T15:00:00Z'));
    snapshot.issueComments.push(
      comment(6, rabbit, 'thanks', '2026-10-07T15:01:00Z'),
      // A request to a bot isn't an answer.
      comment(7, human, 'Agent: @codex review', '2026-10-07T15:01:30Z')
    );
    expect(unansweredReviewBodies(snapshot).map(r => r.id)).toEqual([1]);
    snapshot.reviews.push(review(9, human, 'COMMENTED', null, '2026-10-07T15:02:00Z'));
    expect(unansweredReviewBodies(snapshot)).toEqual([]);
  });

  it('counts a later comment that says more than a bot command as an answer', () => {
    const snapshot = fixture('pr-67');
    snapshot.reviews.push(review(1, rabbit, 'COMMENTED', outside, '2026-10-07T15:00:00Z'));
    snapshot.issueComments.push(
      comment(
        2,
        human,
        'Agent: @codex review once the outside-diff comment is fixed.',
        '2026-10-07T15:01:00Z'
      )
    );
    expect(unansweredReviewBodies(snapshot)).toEqual([]);
  });
});

describe('botOutputSincePush', () => {
  it("lists nitpick sections and Codex's and CodeRabbit's other comments since the push", () => {
    const snapshot = fixture('pr-67');
    snapshot.reviews.push(
      review(
        1,
        rabbit,
        'COMMENTED',
        '<summary>🧹 Nitpick comments (3)</summary>',
        '2026-10-07T15:00:00Z'
      ),
      review(
        2,
        rabbit,
        'COMMENTED',
        '<summary>🧹 Nitpick comments (4)</summary>',
        '2026-10-07T14:43:09Z'
      ),
      review(3, human, 'COMMENTED', 'Nitpick comments (5)', '2026-10-07T15:00:00Z')
    );
    snapshot.issueComments.push(
      comment(4, codexBot, "Codex Review: Didn't find any major issues.", '2026-10-07T15:10:00Z'),
      comment(
        5,
        rabbit,
        '<!-- This is an auto-generated reply by CodeRabbit --> done',
        '2026-10-07T15:11:00Z'
      ),
      comment(6, rabbit, 'An old comment', '2026-10-07T14:43:09Z'),
      comment(7, { login: 'vercel[bot]', type: 'Bot' }, 'Deployed', '2026-10-07T15:12:00Z')
    );
    // The fixture's own comments are CodeRabbit's rate-limit note and Codex's summary.
    expect(botOutputSincePush(snapshot)).toEqual([
      `coderabbitai[bot] left 3 nitpick comments in ${pull67}#pullrequestreview-1`,
      `chatgpt-codex-connector[bot] commented: ${pull67}#issuecomment-4`,
    ]);
  });
});

describe('classify edges', () => {
  it("reports a closed PR as closed and doesn't check the bots", () => {
    const snapshot = fixture('pr-67');
    snapshot.pull.state = 'closed';
    const status = classify(snapshot, at('2026-10-07T15:00:00Z'));
    expect(status.state).toBe('closed');
    expect(status.codex).toEqual({ state: 'skipped', detail: 'The PR is closed' });
    expect(status.coderabbit).toEqual({ state: 'skipped', detail: 'The PR is closed' });
  });

  it('reports a PR with only merged_at as merged', () => {
    const snapshot = fixture('pr-67');
    Object.assign(snapshot.pull, {
      state: 'closed',
      merged: undefined,
      merged_at: '2026-10-07T15:00:00Z',
    });
    expect(classify(snapshot, at('2026-10-07T15:00:00Z')).state).toBe('merged');
  });

  it('lists every failed and running check, and gives no missing-CI reason when checks exist', () => {
    const snapshot = reviewed67();
    const named = (name: string): CheckRun => snapshot.checkRuns.find(r => r.name === name)!;
    snapshot.checkRuns = [
      { ...named('test (24)'), conclusion: 'failure' },
      { ...named('test (22)'), conclusion: 'failure' },
      { ...named('package (24)'), status: 'queued', conclusion: null },
      { ...named('package (22)'), status: 'queued', conclusion: null },
    ];
    const status = classify(snapshot, at('2026-10-07T18:00:00Z'));
    expect(status.reasons).toEqual(['CI failed: test (22), test (24)']);
    expect(status.waits).toEqual(['CI is running: package (22), package (24)']);
  });

  it('lists the bots it gave up on in the notes', () => {
    const status = classify(fixture('pr-66'), at('2026-10-07T17:01:00Z'));
    expect(status.notes).toEqual([
      'coderabbitai[bot] replied after your reply: https://github.com/afahy/fluent-measures/pull/66#discussion_r4208534586',
      "Codex hasn't reviewed c7ad2f4 in the 2 hours it has had; its last review was of 91a5d29",
      "CodeRabbit hasn't reviewed c7ad2f4 in the 2 hours it has had",
    ]);
  });

  it('lists waiting bots under waits, and says when GitHub has no merge state yet', () => {
    const snapshot = fixture('pr-67');
    snapshot.pull.mergeable_state = null;
    snapshot.statuses.push({
      context: 'CodeRabbit',
      state: 'pending',
      description: 'Review in progress',
      created_at: '2026-10-07T15:50:00Z',
    });
    snapshot.issueComments = [comment(1, human, '@codex review', '2026-10-07T15:00:00Z')];
    snapshot.reactions = [];
    const status = classify(snapshot, at('2026-10-07T15:51:00Z'));
    expect(status.mergeableState).toBeNull();
    expect(status.waits).toEqual([
      'Asked at 2026-10-07T15:00:00Z for a review of 318c1b7 (until 2026-10-07T16:51:34.000Z)',
      'CodeRabbit is reviewing 318c1b7',
      'GitHub is still working out whether the PR can merge',
    ]);
  });

  it('names the person in a reason, and says so for a deleted account', () => {
    const snapshot = reviewed67();
    snapshot.reviews.push(
      review(1, null, 'CHANGES_REQUESTED', null, '2026-10-07T15:56:00Z'),
      review(2, rabbit, 'CHANGES_REQUESTED', null, '2026-10-07T15:56:00Z'),
      review(3, human, 'CHANGES_REQUESTED', null, '2026-10-07T15:56:00Z'),
      review(4, human, 'DISMISSED', null, '2026-10-07T15:57:00Z'),
      review(5, human, 'CHANGES_REQUESTED', null, null)
    );
    const status = classify(snapshot, at('2026-10-07T16:00:00Z'));
    expect(status.reasons).toEqual([
      `a deleted account requested changes: ${pull67}#pullrequestreview-1`,
    ]);
    expect(status.mergeableState).toBe('clean');
  });
});

describe('mostUrgent and digest', () => {
  it('falls back to waiting for no states', () => {
    expect(mostUrgent([])).toBe('waiting');
  });

  it('changes with the state, head, reasons, actions or notes, but not with the waits', () => {
    const status = classify(fixture('pr-66'), at('2026-10-07T15:20:00Z'));
    const same = digest(status);
    expect(digest({ ...status, waits: [] })).toBe(same);
    expect(digest({ ...status, notes: [] })).not.toBe(same);
    expect(digest({ ...status, reasons: ['x'] })).not.toBe(same);
    expect(digest({ ...status, actions: ['x'] })).not.toBe(same);
    expect(digest({ ...status, state: 'ready' })).not.toBe(same);
    expect(digest({ ...status, head: 'x' })).not.toBe(same);
    expect(JSON.parse(same)).toEqual({
      state: 'waiting',
      head: 'c7ad2f4b90595f059840e8a95dfa50f82b9a0593',
      reasons: [],
      actions: [],
      notes: [
        'coderabbitai[bot] replied after your reply: https://github.com/afahy/fluent-measures/pull/66#discussion_r4208534586',
      ],
    });
  });
});

describe('createClient edges', () => {
  type Call = { url: string; headers: Record<string, string> };

  function fakeFetch(answers: Response[]): { calls: Call[]; fetch: typeof globalThis.fetch } {
    const calls: Call[] = [];
    const fetch = async (url: string, init: Call): Promise<Response> => {
      calls.push({ url, headers: init.headers });
      return answers.shift()!;
    };
    return { calls, fetch: fetch as unknown as typeof globalThis.fetch };
  }

  const json = (body: unknown, headers: Record<string, string> = {}): Response =>
    new Response(JSON.stringify(body), { status: 200, headers });

  it("calls api.github.com by default with GitHub's headers, and no token header without a token", async () => {
    const { calls, fetch } = fakeFetch([json({})]);
    await createClient({ fetch }).get('/repos/a/b');
    expect(calls).toEqual([
      {
        url: 'https://api.github.com/repos/a/b',
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'fluent-measures-pr-status',
        },
      },
    ]);
  });

  it('uses a fresh answer over the cached one, and forgets an ETag the fresh answer lacks', async () => {
    const { calls, fetch } = fakeFetch([
      json({ n: 1 }, { etag: '"a"' }),
      json({ n: 2 }),
      json({ n: 3 }),
    ]);
    const api = createClient({ apiUrl: 'https://api.test', fetch });
    await expect(api.get('/x')).resolves.toEqual({ n: 1 });
    await expect(api.get('/x')).resolves.toEqual({ n: 2 });
    await expect(api.get('/x')).resolves.toEqual({ n: 3 });
    expect(calls.map(c => c.headers['If-None-Match'])).toEqual([undefined, '"a"', undefined]);
  });

  it('treats a 304 with nothing cached as an error', async () => {
    const { fetch } = fakeFetch([new Response(null, { status: 304 })]);
    await expect(
      createClient({ apiUrl: 'https://api.test', fetch }).get('/x')
    ).rejects.toMatchObject({
      status: 304,
    });
  });

  it("doesn't call a 403 a rate limit while requests remain, and cuts a long error body", async () => {
    const { fetch } = fakeFetch([
      new Response('x'.repeat(300), {
        status: 403,
        headers: { 'x-ratelimit-remaining': '12', 'x-ratelimit-reset': '1791400000' },
      }),
    ]);
    await expect(
      createClient({ apiUrl: 'https://api.test', fetch }).get('/x')
    ).rejects.toMatchObject({
      message: `GitHub answered 403 for https://api.test/x: ${'x'.repeat(200)}`,
      retryAt: null,
    });
  });

  it('adds per_page to a path with a query, reads a next link without a space, and rejects a non-list', async () => {
    const { calls, fetch } = fakeFetch([
      json([1], { link: '<https://api.test/z?page=2>;rel="next"' }),
      json([2]),
      json({ not: 'a list' }),
    ]);
    const api = createClient({ apiUrl: 'https://api.test', fetch });
    await expect(api.getAll('/z?state=all')).resolves.toEqual([1, 2]);
    expect(calls.map(c => c.url)).toEqual([
      'https://api.test/z?state=all&per_page=100',
      'https://api.test/z?page=2',
    ]);
    await expect(api.getAll('/w')).rejects.toThrow(
      'Expected a list from https://api.test/w?per_page=100'
    );
  });
});

describe('collect', () => {
  function fakeApi(pull: unknown): {
    paths: string[];
    api: {
      get(path: string): Promise<unknown>;
      getAll(path: string, key?: string): Promise<unknown[]>;
    };
  } {
    const paths: string[] = [];
    return {
      paths,
      api: {
        async get(path: string): Promise<unknown> {
          paths.push(`get ${path}`);
          if (path.endsWith('/pulls/7')) return pull;
          if (path.includes('/activity')) return ['push'];
          // The base branch has no .github/CODEOWNERS, but has one at the root.
          if (path.includes('/contents/.github/'))
            throw Object.assign(new Error('404'), { status: 404 });
          if (path.includes('/contents/CODEOWNERS')) {
            return { content: Buffer.from('* @afahy\n').toString('base64') };
          }
          return { committer: { date: 'd' } };
        },
        async getAll(path: string, key?: string): Promise<unknown[]> {
          paths.push(`all ${path}${key ? ` ${key}` : ''}`);
          return path.endsWith('/files') ? [{ filename: 'a.ts' }] : [path];
        },
      },
    };
  }

  it("reads the PR, then its head commit, the branch's pushes, its events and its comments", async () => {
    const pull = {
      head: { sha: 'abc1234', ref: 'feature/a b', repo: { full_name: 'fork/r' } },
      base: { ref: 'main' },
    };
    const { paths, api } = fakeApi(pull);
    const snapshot = await collect(api, 'o/r', 7);
    expect(paths).toEqual([
      'get /repos/o/r/pulls/7',
      'get /repos/o/r/git/commits/abc1234',
      'get /repos/fork/r/activity?ref=feature%2Fa%20b&per_page=100',
      'all /repos/o/r/issues/7/events',
      'all /repos/o/r/commits/abc1234/check-runs check_runs',
      'all /repos/o/r/commits/abc1234/statuses',
      'all /repos/o/r/issues/7/comments',
      'all /repos/o/r/pulls/7/reviews',
      'all /repos/o/r/pulls/7/comments',
      'all /repos/o/r/issues/7/reactions',
      'all /repos/o/r/pulls/7/files',
      'get /repos/o/r/contents/.github/CODEOWNERS?ref=main',
      'get /repos/o/r/contents/CODEOWNERS?ref=main',
    ]);
    expect(snapshot).toEqual({
      pull,
      headCommit: { committer: { date: 'd' } },
      pushes: ['push'],
      events: ['/repos/o/r/issues/7/events'],
      checkRuns: ['/repos/o/r/commits/abc1234/check-runs'],
      statuses: ['/repos/o/r/commits/abc1234/statuses'],
      issueComments: ['/repos/o/r/issues/7/comments'],
      reviews: ['/repos/o/r/pulls/7/reviews'],
      reviewComments: ['/repos/o/r/pulls/7/comments'],
      reactions: ['/repos/o/r/issues/7/reactions'],
      files: ['a.ts'],
      codeowners: '* @afahy\n',
    });
  });

  it("skips the pushes when the PR's fork was deleted", async () => {
    const { paths, api } = fakeApi({
      head: { sha: 'abc1234', ref: 'x', repo: null },
      base: { ref: 'main' },
    });
    const snapshot = await collect(api, 'o/r', 7);
    expect(snapshot.pushes).toEqual([]);
    expect(paths.some(p => p.includes('/activity'))).toBe(false);
  });
});

// Cases from mutation testing: each pins down a behavior that no test above checks.
describe('pr-state.mjs details', () => {
  it("doesn't crash on comments and reactions from deleted accounts", () => {
    const snapshot = fixture('pr-66');
    snapshot.issueComments.push(comment(90, null, '@codex review', '2026-10-07T15:10:00Z'));
    snapshot.reactions.push({ user: null, content: 'eyes', created_at: '2026-10-07T15:10:00Z' });
    snapshot.reviews.push(
      review(91, null, 'COMMENTED', 'Nitpick comments (2)', '2026-10-07T15:10:00Z')
    );
    snapshot.reviewComments.push(threadComment(92, null, '2026-10-07T15:10:00Z'));
    const status = classify(snapshot, at('2026-10-07T15:40:00Z'));
    // A deleted account's request still counts as a person's.
    expect(status.codex.state).toBe('requested');
  });

  it("ignores a person's copy of Codex's summary, and finds the summary after other Codex comments", () => {
    const snapshot = fixture('pr-66');
    const summary = snapshot.issueComments.find(c => c.user?.login === codexBot.login)!;
    const fake = summary
      .body!.replace('✅ **Completed**', '✅ **Completed**')
      .replace('`91a5d29`', '`c7ad2f4`');
    snapshot.issueComments.unshift(
      comment(80, human, fake, '2026-10-07T14:40:00Z'),
      comment(81, codexBot, '**Reviewed commit:** `91a5d29c8f`', '2026-10-07T14:41:00Z')
    );
    expect(codexState(snapshot, at('2026-10-07T15:40:00Z')).detail).toBe(
      "Codex hasn't reviewed c7ad2f4 30 minutes after it could start; its last review was of 91a5d29"
    );
  });

  it('names the completed review and the 👀 in their details', () => {
    expect(codexState(fixture('pr-67'), at('2026-10-07T15:00:00Z'))).toEqual({
      state: 'done',
      detail: 'Codex completed its review of 318c1b7',
    });
    const snapshot = fixture('pr-66');
    snapshot.reactions.push({
      user: codexBot,
      content: 'eyes',
      created_at: '2026-10-07T15:10:00Z',
    });
    expect(codexState(snapshot, at('2026-10-07T15:40:00Z'))).toEqual({
      state: 'running',
      detail: 'Codex is reviewing (👀)',
    });
  });

  it('reads a CodeRabbit request with extra spaces, and an answer at the same second', () => {
    const snapshot = fixture('pr-67');
    snapshot.issueComments.push(
      comment(1, human, '@coderabbitai  review', '2026-10-07T15:50:00Z'),
      comment(
        2,
        rabbit,
        '<summary>⚠️ Action not completed</summary>\n\nReview rate limited.',
        '2026-10-07T15:50:00Z'
      )
    );
    expect(coderabbitState(snapshot, at('2026-10-07T15:51:00Z'))).toEqual({
      state: 'refused',
      detail: 'CodeRabbit refused the review request: Review rate limited.',
      until: '2026-10-07T16:51:34.000Z',
    });
  });

  it('counts a rate-limit note edited at the second of the push', () => {
    const snapshot = fixture('pr-67');
    const note = snapshot.issueComments.find(c => c.user?.login === rabbit.login)!;
    // The push was at 14:43:10. 14:43:10 plus 57 minutes is 15:40:10.
    note.updated_at = '2026-10-07T14:43:10Z';
    expect(coderabbitState(snapshot, at('2026-10-07T15:00:00Z')).until).toBe(
      '2026-10-07T15:40:10.000Z'
    );
  });

  it('says CodeRabbit reviewed the head when its status says so', () => {
    expect(coderabbitState(reviewed67(), at('2026-10-07T16:00:00Z'))).toEqual({
      state: 'done',
      detail: 'CodeRabbit reviewed 318c1b7',
    });
  });

  it('treats only a comment that is nothing but a bot command as no answer', () => {
    const outside = '<summary>⚠️ Outside diff range comments (1)</summary>';
    const answered = (body: string): boolean => {
      const snapshot = fixture('pr-67');
      snapshot.reviews.push(review(1, rabbit, 'COMMENTED', outside, '2026-10-07T15:00:00Z'));
      snapshot.issueComments.push(comment(2, human, body, '2026-10-07T15:01:00Z'));
      return unansweredReviewBodies(snapshot).length === 0;
    };
    expect(answered('@codex review')).toBe(false);
    expect(answered('Agent: @codex review.')).toBe(false);
    expect(answered('agent:@coderabbitai  review')).toBe(false);
    expect(answered('Thanks. @codex review')).toBe(true);
    expect(answered('x@codex review')).toBe(true);
  });

  it('lists a nitpick section with a two-digit count, and bot output at the second of the push', () => {
    const snapshot = fixture('pr-67');
    snapshot.reviews.push(
      review(
        1,
        rabbit,
        'COMMENTED',
        '<summary>🧹 Nitpick comments (12)</summary>',
        '2026-10-07T14:43:10Z'
      )
    );
    snapshot.issueComments.push(comment(2, codexBot, 'A finding', '2026-10-07T14:43:10Z'));
    const status = classify(snapshot, at('2026-10-07T15:00:00Z'));
    expect(status.notes).toEqual([
      `coderabbitai[bot] left 12 nitpick comments in ${pull67}#pullrequestreview-1`,
      `chatgpt-codex-connector[bot] commented: ${pull67}#issuecomment-2`,
    ]);
  });

  it("uses a person's latest decision whatever order the reviews come in", () => {
    const snapshot = reviewed67();
    snapshot.reviews.push(
      review(1, human, 'CHANGES_REQUESTED', null, '2026-10-07T15:57:00Z'),
      review(2, human, 'APPROVED', null, '2026-10-07T15:56:00Z')
    );
    expect(classify(snapshot, at('2026-10-07T16:00:00Z')).reasons).toEqual([
      `afahy requested changes: ${pull67}#pullrequestreview-1`,
    ]);
  });

  it("doesn't count a reply from a bot without [bot] in its login as an answer", () => {
    const comments = [
      threadComment(1, codexBot, '2026-10-07T10:00:00Z'),
      threadComment(2, { login: 'github-actions', type: 'Bot' }, '2026-10-07T10:01:00Z', 1),
    ];
    expect(unansweredBotThreads(comments).map(c => c.id)).toEqual([1]);
  });

  it('explains why the bots skip a draft', () => {
    const snapshot = fixture('pr-67');
    snapshot.pull.draft = true;
    expect(classify(snapshot, at('2026-10-07T15:00:00Z')).codex).toEqual({
      state: 'skipped',
      detail: "The bots don't review drafts",
    });
  });
});

describe('CODEOWNERS', () => {
  const codeowners = readFileSync('tests/fixtures/pr-status/CODEOWNERS', 'utf8');

  it("finds the changed files that this repository's CODEOWNERS covers", () => {
    const files = [
      '.github/scripts/pr-state.mjs',
      'package.json',
      'tests/prState.test.ts',
      '.claude/skills/steward/SKILL.md',
      'AGENTS.md',
      'src/index.ts',
      '.changeset/x.md',
      '.changeset/config.json',
      // A pattern with no slash matches at any depth.
      'docs/AGENTS.md',
    ];
    expect(ownedFiles(codeowners, files)).toEqual([
      '.github/scripts/pr-state.mjs',
      'package.json',
      '.claude/skills/steward/SKILL.md',
      'AGENTS.md',
      '.changeset/config.json',
      'docs/AGENTS.md',
    ]);
  });

  it.each([
    ['docs/*', 'docs/a.md', true],
    ['docs/*', 'docs/b/c.md', false],
    ['docs/*', 'x/docs/a.md', false],
    ['/apps/github', 'apps/github/x.ts', true],
    ['/apps/github', 'apps/github', true],
    ['/apps/github', 'apps/githubx', false],
    ['**/logs', 'x/y/logs/a', true],
    ['**/logs', 'logs/a', true],
    ['a/**/b', 'a/b', true],
    ['a/**/b', 'a/x/y/b', true],
    ['*.js', 'src/y.js', true],
    ['*.js', 'x.jsx', false],
    ['apps/', 'x/apps/a', true],
    ['apps/', 'apps', false],
    ['?.md', 'a.md', true],
    ['?.md', 'ab.md', false],
    ['a+b.txt', 'a+b.txt', true],
    ['a+b.txt', 'aab.txt', false],
  ])('reads %s as matching %s: %s', (pattern, path, expected) => {
    expect(codeownersPattern(pattern).test(path)).toBe(expected);
  });

  it('lets a later line with no owners take the owner away, and skips comments', () => {
    const file = '# Everything\n* @afahy\n/docs/\nREADME.md @afahy # owned again\n';
    expect(ownedFiles(file, ['src/a.ts', 'docs/a.md', 'README.md', 'docs/README.md'])).toEqual([
      'src/a.ts',
      'README.md',
      'docs/README.md',
    ]);
  });

  it('leaves a PR that changes covered files to the maintainer, and only such a PR', () => {
    const snapshot = reviewed67();
    expect(classify(snapshot, at('2026-10-07T16:00:00Z')).state).toBe('ready');
    snapshot.files.push('.github/workflows/x.yml', 'AGENTS.md', 'package.json', '.claude/a.md');
    const status = classify(snapshot, at('2026-10-07T16:00:00Z'));
    expect(status.state).toBe('waiting-human');
    expect(status.reasons).toEqual([
      'It changes files that CODEOWNERS covers, so only the maintainer can merge it: .github/workflows/x.yml, AGENTS.md, package.json and 1 more',
    ]);
    snapshot.codeowners = null;
    expect(classify(snapshot, at('2026-10-07T16:00:00Z')).state).toBe('ready');
  });
});

describe("Codex's 👍 and the review rounds", () => {
  it('counts a 👍 from Codex after the push as a finished review, but not a person’s', () => {
    const snapshot = fixture('pr-66');
    snapshot.reactions.push({ user: human, content: '+1', created_at: '2026-10-07T15:10:00Z' });
    expect(codexState(snapshot, at('2026-10-07T15:40:00Z')).state).toBe('not-requested');
    snapshot.reactions.push({ user: codexBot, content: '+1', created_at: '2026-10-07T15:00:44Z' });
    expect(codexState(snapshot, at('2026-10-07T15:40:00Z'))).toEqual({
      state: 'done',
      detail: 'Codex reacted 👍 after c7ad2f4 was pushed',
    });
  });

  it('waits for a bot instead of asking it when the review rounds are used up', () => {
    const status = classify(fixture('pr-66'), at('2026-10-07T15:31:00Z'), { requests: false });
    expect(status.state).toBe('waiting');
    expect(status.actions).toEqual([]);
    expect(status.codex).toEqual({
      state: 'pending',
      detail:
        "Codex hasn't reviewed c7ad2f4 30 minutes after it could start; its last review was of 91a5d29, and the review rounds are used up",
      until: '2026-10-07T17:00:44.000Z',
    });
    const later = classify(fixture('pr-66'), at('2026-10-07T17:00:44Z'), { requests: false });
    expect(later.state).toBe('waiting-human');
  });
});
