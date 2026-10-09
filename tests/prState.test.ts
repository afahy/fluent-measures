import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  botFollowUps,
  ciSummary,
  classify,
  codexSummaryRows,
  createClient,
  mostUrgent,
  shaMatches,
  unansweredBotThreads,
  type CheckRun,
  type IssueComment,
  type Review,
  type Snapshot,
} from '../.github/scripts/pr-state.mjs';

// Each fixture holds GitHub's REST responses for a real PR in this repo, trimmed to the fields
// that pr-state.mjs reads:
//   pr-43-at-1810  #43 as it was at 2026-10-05T18:10:00Z, before the agent answered two bot
//                  threads. Items created after then are left out, and the PR is open.
//   pr-43          #43 after it merged.
//   pr-66          #66 at 2026-10-07T15:51Z. Codex reviewed 91a5d29 when the PR opened but not
//                  the head c7ad2f4, pushed at 15:00:44. CodeRabbit was rate limited on the head
//                  and left no note saying for how long.
//   pr-67          #67 at 2026-10-07T15:51Z. The branch was pushed at 14:43:10 and the PR opened
//                  at 14:51:34, so the bots could start then. Codex completed a review of the
//                  head 318c1b7. CodeRabbit's note at 14:51:45 says "Next included review
//                  available in 57 minutes".
// Every expected value below was worked out by hand from those responses.
function fixture(name: string): Snapshot {
  return JSON.parse(readFileSync(`tests/fixtures/pr-status/${name}.json`, 'utf8'));
}

const at = (time: string): number => Date.parse(time);
const pr66 = 'https://github.com/afahy/fluent-measures/pull/66';

describe('shaMatches', () => {
  const full = '333a541a23a7202e471f558968e08b42f8cd6468';

  it('matches a short SHA of 7 or more characters against the full SHA, either way round', () => {
    expect(shaMatches('333a541', full)).toBe(true);
    expect(shaMatches(full, '333A541A23')).toBe(true);
    expect(shaMatches(full, full)).toBe(true);
  });

  it('rejects a prefix shorter than 7 characters, another commit, or no SHA', () => {
    expect(shaMatches('333a54', full)).toBe(false);
    expect(shaMatches('333a542', full)).toBe(false);
    expect(shaMatches(null, full)).toBe(false);
    expect(shaMatches(full, '')).toBe(false);
  });
});

describe('codexSummaryRows', () => {
  it("reads the review, its status and its commit from Codex's summary comment", () => {
    const body = fixture('pr-43-at-1810').issueComments.find(c =>
      c.body?.includes('codex-pull-request-review-summary')
    )?.body;
    expect(codexSummaryRows(body ?? '')).toEqual([
      { review: 'Code Review', status: 'Completed', commit: '333a541' },
    ]);
  });

  it('reads a running review, and skips lines that are not review rows', () => {
    const body = [
      '| Review | Status | Commit | Review trigger |',
      '| --- | --- | --- | --- |',
      '| 📝 **Code Review** | 🔄 **Running** since 2026-10-05T02:50:32Z | `b92e3aa` | New commits |',
      'Reviews are triggered when you',
    ].join('\n');
    expect(codexSummaryRows(body)).toEqual([
      { review: 'Code Review', status: 'Running', commit: 'b92e3aa' },
    ]);
  });
});

describe('ciSummary', () => {
  const run = (id: number, name: string, status: string, conclusion: string | null): CheckRun => ({
    id,
    name,
    status,
    conclusion,
    started_at: '2026-10-07T10:00:00Z',
    app: { slug: 'github-actions' },
  });

  it('uses the latest run of a re-run check', () => {
    const summary = ciSummary(
      [run(2, 'test (22)', 'completed', 'success'), run(1, 'test (22)', 'completed', 'failure')],
      []
    );
    expect(summary).toEqual({ passed: ['test (22)'], pending: [], failed: [] });
  });

  it('counts failing conclusions as failed, and neutral or skipped ones as passed', () => {
    const summary = ciSummary(
      [
        run(1, 'a', 'completed', 'timed_out'),
        run(2, 'b', 'completed', 'cancelled'),
        run(3, 'c', 'completed', 'neutral'),
        run(4, 'd', 'completed', 'skipped'),
        run(5, 'e', 'in_progress', null),
        run(6, 'f', 'queued', null),
      ],
      []
    );
    expect(summary).toEqual({ passed: ['c', 'd'], pending: ['e', 'f'], failed: ['a', 'b'] });
  });

  it("leaves out CodeRabbit's status, whose rate-limit note is a success", () => {
    const summary = ciSummary([], fixture('pr-67').statuses);
    expect(summary).toEqual({ passed: [], pending: [], failed: [] });
  });

  it("uses each other status context's latest state", () => {
    const summary = ciSummary(
      [],
      [
        { context: 'deploy', state: 'pending', description: null, created_at: '2026-10-07T10:00Z' },
        { context: 'deploy', state: 'failure', description: null, created_at: '2026-10-07T10:05Z' },
      ]
    );
    expect(summary).toEqual({ passed: [], pending: [], failed: ['deploy'] });
  });
});

describe('unansweredBotThreads and botFollowUps', () => {
  it("lists the bot threads that a person hasn't replied to", () => {
    const threads = unansweredBotThreads(fixture('pr-43-at-1810').reviewComments);
    // 4187006557 has a reply from afahy. 4187121862 (Codex) and 4187191635 (CodeRabbit) don't.
    expect(threads.map(t => t.id)).toEqual([4187121862, 4187191635]);
  });

  it('lists a bot reply that came after the last reply from a person', () => {
    const comments = fixture('pr-66').reviewComments;
    expect(unansweredBotThreads(comments)).toEqual([]);
    // CodeRabbit answered afahy's reply in thread 4208427691.
    expect(botFollowUps(comments).map(c => c.id)).toEqual([4208534586]);
  });
});

describe('classify', () => {
  it('needs the agent when bot threads have no reply (#43 at 18:10)', () => {
    const status = classify(fixture('pr-43-at-1810'), at('2026-10-05T18:10:00Z'));
    expect(status.state).toBe('needs-agent');
    expect(status.pushedAt).toBe('2026-10-05T17:51:02Z');
    expect(status.ci).toEqual(expect.objectContaining({ pending: [], failed: [] }));
    // 13 runs, but two checks ran twice after title edits, so 11 checks.
    expect(status.ci.passed).toHaveLength(11);
    expect(status.codex.state).toBe('done');
    // CodeRabbit's status on 333a541 changed to "Review completed" at 18:09:09.
    expect(status.coderabbit.state).toBe('done');
    expect(status.reasons).toEqual([
      'chatgpt-codex-connector[bot] left a thread with no reply: https://github.com/afahy/fluent-measures/pull/43#discussion_r4187121862',
      'coderabbitai[bot] left a thread with no reply: https://github.com/afahy/fluent-measures/pull/43#discussion_r4187191635',
    ]);
    expect(status.actions).toEqual([]);
  });

  it('reports a merged PR as merged, with any bot reply to read', () => {
    const status = classify(fixture('pr-43'), at('2026-10-07T12:00:00Z'));
    expect(status.state).toBe('merged');
    expect(status.reasons).toEqual([]);
    expect(status.notes).toEqual([
      'coderabbitai[bot] replied after your reply: https://github.com/afahy/fluent-measures/pull/43#discussion_r4187373760',
    ]);
  });

  // AFA-138: CodeRabbit adds no wait, so only the Codex wait remains.
  it('waits only for Codex to start, and notes CodeRabbit (#66 at 15:20)', () => {
    const status = classify(fixture('pr-66'), at('2026-10-07T15:20:00Z'));
    expect(status.state).toBe('waiting');
    expect(status.pushedAt).toBe('2026-10-07T15:00:44Z');
    expect(status.ci.passed).toHaveLength(12);
    expect(status.codex.state).toBe('pending');
    expect(status.coderabbit.state).toBe('rate-limited');
    expect(status.waits).toEqual([
      "Codex hasn't started on c7ad2f4; its last review was of 91a5d29 (until 2026-10-07T15:30:44.000Z)",
    ]);
    expect(status.notes).toEqual([
      `coderabbitai[bot] replied after your reply: ${pr66}#discussion_r4208534586`,
      'CodeRabbit was rate limited on c7ad2f4',
    ]);
  });

  it('asks for a Codex review 30 minutes after the push (#66 at 15:31)', () => {
    const before = classify(fixture('pr-66'), at('2026-10-07T15:30:43Z'));
    expect(before.state).toBe('waiting');
    const status = classify(fixture('pr-66'), at('2026-10-07T15:30:44Z'));
    expect(status.state).toBe('needs-agent');
    expect(status.reasons).toEqual([
      "Codex hasn't reviewed c7ad2f4 30 minutes after it could start; its last review was of 91a5d29",
    ]);
    expect(status.actions).toEqual(['Post `@codex review`']);
  });

  it("doesn't wait for or ask a rate-limited CodeRabbit (#66 at 16:02, #67 at 15:48)", () => {
    expect.assertions(13);
    const pr66Status = classify(fixture('pr-66'), at('2026-10-07T16:02:00Z'));
    expect(pr66Status.actions).toEqual(['Post `@codex review`']);

    // #67's only open item was CodeRabbit's limit, which ends at 15:48:45. The PR is ready
    // before and after that time, with no request to CodeRabbit.
    for (const time of ['2026-10-07T15:48:44Z', '2026-10-07T15:48:45Z']) {
      const status = classify(fixture('pr-67'), at(time));
      expect(status.state).toBe('ready');
      expect(status.waits).toEqual([]);
      expect(status.reasons).toEqual([]);
      expect(status.actions).toEqual([]);
      expect(status.codex.state).toBe('done');
      expect(status.notes).toEqual(['CodeRabbit was rate limited on 318c1b7']);
    }
  });

  it('leaves the merge to the maintainer when Codex never reviews the head in 2 hours', () => {
    // 15:00:44 plus 2 hours.
    const before = classify(fixture('pr-66'), at('2026-10-07T17:00:43Z'));
    expect(before.codex.state).toBe('not-requested');
    const status = classify(fixture('pr-66'), at('2026-10-07T17:00:44Z'));
    expect(status.state).toBe('waiting-human');
    expect(status.codex.state).toBe('gave-up');
    // CodeRabbit was rate limited on c7ad2f4, so the PR never waited for it.
    expect(status.coderabbit.state).toBe('rate-limited');
    expect(status.reasons).toEqual([
      'Codex never reviewed the head commit, so only the maintainer can merge it',
    ]);
    expect(status.actions).toEqual([]);
  });

  it('treats a running Codex review of the head as running', () => {
    const snapshot = fixture('pr-66');
    const summary = snapshot.issueComments.find(c => c.user?.login.startsWith('chatgpt-codex'));
    // Replace the completed review of 91a5d29 with a running review of the head.
    expect(summary?.body).toContain('| `91a5d29` |');
    summary!.body = summary!
      .body!.replace(/✅ \*\*Completed\*\*/, '🔄 **Running**')
      .replace('`91a5d29`', '`c7ad2f4`');
    const status = classify(snapshot, at('2026-10-07T15:40:00Z'));
    expect(status.codex).toEqual({
      state: 'running',
      detail: "Codex's review of c7ad2f4 is Running",
    });
    expect(status.state).toBe('waiting');
  });

  it("treats Codex's 👀 reaction as a review in progress, not a finished one", () => {
    const snapshot = fixture('pr-66');
    snapshot.reactions.push({
      user: { login: 'chatgpt-codex-connector[bot]', type: 'Bot' },
      content: 'eyes',
      created_at: '2026-10-07T15:35:00Z',
    });
    const status = classify(snapshot, at('2026-10-07T15:40:00Z'));
    expect(status.codex.state).toBe('running');
    expect(status.state).toBe('waiting');
  });

  it('counts a Codex review of the head as done, and not a review of an earlier commit', () => {
    const snapshot = fixture('pr-66');
    const review = (commit: string): Review => ({
      id: 1,
      user: { login: 'chatgpt-codex-connector[bot]', type: 'Bot' },
      state: 'COMMENTED',
      body: '### 💡 Codex Review',
      commit_id: commit,
      submitted_at: '2026-10-07T15:20:00Z',
      html_url: `${pr66}#pullrequestreview-1`,
    });
    snapshot.reviews.push(review('91a5d29c8f62b5cbdececfcdb0a60e77d8209fc6'));
    expect(classify(snapshot, at('2026-10-07T15:40:00Z')).codex.state).toBe('not-requested');
    snapshot.reviews.push(review('c7ad2f4b90595f059840e8a95dfa50f82b9a0593'));
    expect(classify(snapshot, at('2026-10-07T15:40:00Z')).codex.state).toBe('done');
  });

  it('waits up to 2 hours after asking a bot once', () => {
    const snapshot = fixture('pr-66');
    const ask: IssueComment = {
      id: 1,
      user: { login: 'afahy', type: 'User' },
      body: 'Agent: @codex review',
      created_at: '2026-10-07T15:35:00Z',
      updated_at: '2026-10-07T15:35:00Z',
      html_url: `${pr66}#issuecomment-1`,
    };
    snapshot.issueComments.push(ask);
    const status = classify(snapshot, at('2026-10-07T15:40:00Z'));
    expect(status.codex).toEqual({
      state: 'requested',
      detail:
        'Asked at 2026-10-07T15:35:00Z for a review of c7ad2f4; its last review was of 91a5d29',
      until: '2026-10-07T17:00:44.000Z',
    });
    expect(status.state).toBe('waiting');
  });

  // AFA-138: a PR doesn't wait for CodeRabbit after a refusal, an open request or a running
  // review. The note tells the agent what CodeRabbit did.
  it('is ready, with a note, when CodeRabbit refuses a review request', () => {
    const snapshot = fixture('pr-67');
    // CodeRabbit's real answer to a request on #43.
    const refusal = fixture('pr-43').issueComments.find(c =>
      c.body?.includes('Action not completed')
    );
    snapshot.issueComments.push(
      {
        id: 1,
        user: { login: 'afahy', type: 'User' },
        body: '@coderabbitai review',
        created_at: '2026-10-07T15:50:00Z',
        updated_at: '2026-10-07T15:50:00Z',
        html_url: 'https://github.com/afahy/fluent-measures/pull/67#issuecomment-1',
      },
      { ...refusal!, created_at: '2026-10-07T15:50:08Z' }
    );
    const status = classify(snapshot, at('2026-10-07T15:51:00Z'));
    expect(status.coderabbit).toEqual({
      state: 'refused',
      detail: 'CodeRabbit refused the review request: Pull request base or head changed.',
    });
    expect(status.state).toBe('ready');
    expect(status.notes).toEqual([
      'CodeRabbit refused the review request: Pull request base or head changed.',
    ]);
  });

  it('is ready, with a note that names the request, while a CodeRabbit request is open (#67 at 15:51)', () => {
    const snapshot = fixture('pr-67');
    snapshot.issueComments.push({
      id: 1,
      user: { login: 'afahy', type: 'User' },
      body: 'Agent: @coderabbitai review',
      created_at: '2026-10-07T15:50:00Z',
      updated_at: '2026-10-07T15:50:00Z',
      html_url: 'https://github.com/afahy/fluent-measures/pull/67#issuecomment-1',
    });
    const status = classify(snapshot, at('2026-10-07T15:51:00Z'));
    expect(status.coderabbit.state).toBe('requested');
    expect(status.state).toBe('ready');
    expect(status.waits).toEqual([]);
    expect(status.actions).toEqual([]);
    expect(status.notes).toEqual([
      'CodeRabbit was asked at 2026-10-07T15:50:00Z for a review of 318c1b7',
    ]);
  });

  it('is ready, with a note, while CodeRabbit reviews the head', () => {
    const snapshot = fixture('pr-67');
    snapshot.statuses.push({
      context: 'CodeRabbit',
      state: 'pending',
      description: 'Review in progress',
      created_at: '2026-10-07T15:50:00Z',
    });
    const status = classify(snapshot, at('2026-10-07T15:51:00Z'));
    expect(status.coderabbit.state).toBe('running');
    expect(status.state).toBe('ready');
    expect(status.waits).toEqual([]);
    expect(status.notes).toEqual(['CodeRabbit is reviewing 318c1b7']);
  });

  it('is ready when CI passed, both bots reviewed the head and GitHub allows the merge', () => {
    const snapshot = fixture('pr-67');
    snapshot.statuses.push({
      context: 'CodeRabbit',
      state: 'success',
      description: 'Review completed',
      created_at: '2026-10-07T15:55:00Z',
    });
    expect(classify(snapshot, at('2026-10-07T16:00:00Z')).state).toBe('ready');
    snapshot.pull.mergeable_state = 'blocked';
    const blocked = classify(snapshot, at('2026-10-07T16:00:00Z'));
    expect(blocked.state).toBe('waiting-human');
    expect(blocked.reasons).toEqual(['GitHub blocks the merge, usually until a required review']);
    snapshot.pull.mergeable_state = 'unknown';
    expect(classify(snapshot, at('2026-10-07T16:00:00Z')).state).toBe('waiting');
  });

  it('needs the agent for a merge conflict or failed CI, and waits for running CI', () => {
    const snapshot = fixture('pr-67');
    snapshot.statuses.push({
      context: 'CodeRabbit',
      state: 'success',
      description: 'Review completed',
      created_at: '2026-10-07T15:55:00Z',
    });
    const mutation = snapshot.checkRuns.find(r => r.name === 'mutation')!;
    mutation.status = 'in_progress';
    mutation.conclusion = null;
    const running = classify(snapshot, at('2026-10-07T16:00:00Z'));
    expect(running.state).toBe('waiting');
    expect(running.waits).toEqual(['CI is running: mutation']);

    mutation.status = 'completed';
    mutation.conclusion = 'failure';
    const failed = classify(snapshot, at('2026-10-07T16:00:00Z'));
    expect(failed.state).toBe('needs-agent');
    expect(failed.reasons).toEqual(['CI failed: mutation']);

    mutation.conclusion = 'success';
    snapshot.pull.mergeable_state = 'dirty';
    const conflict = classify(snapshot, at('2026-10-07T16:00:00Z'));
    expect(conflict.reasons).toEqual(['The PR has a merge conflict with its base']);
  });

  it('waits 30 minutes for CI to start, then reports that none ran', () => {
    const snapshot = fixture('pr-67');
    snapshot.checkRuns = [];
    snapshot.statuses = [];
    // CI could start when the PR opened at 14:51:34.
    const waiting = classify(snapshot, at('2026-10-07T15:21:33Z'));
    expect(waiting.state).toBe('waiting');
    expect(waiting.waits).toContain("CI hasn't started on 318c1b7");
    const missing = classify(snapshot, at('2026-10-07T15:21:34Z'));
    expect(missing.state).toBe('needs-agent');
    expect(missing.reasons).toContain(
      'No CI ran on 318c1b7 in the 30 minutes after it could start'
    );
  });

  it("puts a draft on hold for a person, and doesn't ask the bots to review it", () => {
    const snapshot = fixture('pr-66');
    snapshot.pull.draft = true;
    const status = classify(snapshot, at('2026-10-07T16:30:00Z'));
    expect(status.state).toBe('waiting-human');
    expect(status.reasons).toEqual(['The PR is a draft']);
    expect(status.actions).toEqual([]);
    expect(status.codex.state).toBe('skipped');
  });

  it('keeps a draft on hold while its CI runs, and needs the agent when CI fails', () => {
    const snapshot = fixture('pr-66');
    snapshot.pull.draft = true;
    snapshot.pull.mergeable_state = 'unknown';
    const run = snapshot.checkRuns[0];
    run.status = 'in_progress';
    run.conclusion = null;
    const running = classify(snapshot, at('2026-10-07T16:30:00Z'));
    // Only a person can take a PR out of draft, so running CI doesn't make it wait on the agent.
    expect(running.state).toBe('waiting-human');
    expect(running.reasons).toEqual(['The PR is a draft']);

    run.status = 'completed';
    run.conclusion = 'failure';
    const failed = classify(snapshot, at('2026-10-07T16:30:00Z'));
    expect(failed.state).toBe('needs-agent');
    expect(failed.reasons).toEqual([`CI failed: ${run.name}`]);
  });

  // AFA-138, CodeRabbit on #104: a bot's request for changes counts too, until a person answers.
  // A bot can't approve after the agent answers, so an answer clears it. AFA-144: only an answer
  // that links to the review counts, not a comment about something else.
  it('needs the agent after CodeRabbit requests changes, until a person answers', () => {
    const snapshot = fixture('pr-67');
    snapshot.reviews.push({
      id: 2,
      user: { login: 'coderabbitai[bot]', type: 'Bot' },
      state: 'CHANGES_REQUESTED',
      body: 'Actionable comments posted: 0',
      commit_id: '318c1b7f27c418c6a53ecf1c3de26c32ea207cb0',
      submitted_at: '2026-10-07T15:56:00Z',
      html_url: 'https://github.com/afahy/fluent-measures/pull/67#pullrequestreview-2',
    });
    const status = classify(snapshot, at('2026-10-07T16:00:00Z'));
    expect(status.state).toBe('needs-agent');
    expect(status.reasons).toEqual([
      'coderabbitai[bot] requested changes: https://github.com/afahy/fluent-measures/pull/67#pullrequestreview-2. Answer in its threads or in a PR comment that links to it.',
    ]);
    snapshot.issueComments.push({
      id: 3,
      user: { login: 'afahy', type: 'User' },
      body: 'Agent: CI passed on the last push.',
      created_at: '2026-10-07T15:57:00Z',
      updated_at: '2026-10-07T15:57:00Z',
      html_url: 'https://github.com/afahy/fluent-measures/pull/67#issuecomment-3',
    });
    expect(classify(snapshot, at('2026-10-07T16:00:00Z')).state).toBe('needs-agent');
    snapshot.issueComments.push({
      id: 4,
      user: { login: 'afahy', type: 'User' },
      body: 'Agent: https://github.com/afahy/fluent-measures/pull/67#pullrequestreview-2 is not valid, because …',
      created_at: '2026-10-07T15:58:00Z',
      updated_at: '2026-10-07T15:58:00Z',
      html_url: 'https://github.com/afahy/fluent-measures/pull/67#issuecomment-4',
    });
    expect(classify(snapshot, at('2026-10-07T16:00:00Z')).state).toBe('ready');
  });

  // Codex on #104: a reply in a thread that the review started answers it too.
  it('takes a reply in one of its threads as an answer to a bot that requests changes', () => {
    const snapshot = fixture('pr-67');
    snapshot.reviews.push({
      id: 2,
      user: { login: 'coderabbitai[bot]', type: 'Bot' },
      state: 'CHANGES_REQUESTED',
      body: 'Actionable comments posted: 1',
      commit_id: '318c1b7f27c418c6a53ecf1c3de26c32ea207cb0',
      submitted_at: '2026-10-07T15:56:00Z',
      html_url: 'https://github.com/afahy/fluent-measures/pull/67#pullrequestreview-2',
    });
    snapshot.reviewComments.push({
      id: 10,
      user: { login: 'coderabbitai[bot]', type: 'Bot' },
      pull_request_review_id: 2,
      created_at: '2026-10-07T15:56:00Z',
      html_url: 'https://github.com/afahy/fluent-measures/pull/67#discussion_r10',
    });
    expect(classify(snapshot, at('2026-10-07T16:00:00Z')).reasons).toEqual([
      'coderabbitai[bot] left a thread with no reply: https://github.com/afahy/fluent-measures/pull/67#discussion_r10',
      'coderabbitai[bot] requested changes: https://github.com/afahy/fluent-measures/pull/67#pullrequestreview-2. Answer in its threads or in a PR comment that links to it.',
    ]);
    snapshot.reviewComments.push({
      id: 11,
      user: { login: 'afahy', type: 'User' },
      in_reply_to_id: 10,
      created_at: '2026-10-07T15:58:00Z',
      html_url: 'https://github.com/afahy/fluent-measures/pull/67#discussion_r11',
    });
    expect(classify(snapshot, at('2026-10-07T16:00:00Z')).state).toBe('ready');
  });

  it('needs the agent after a person requests changes, until that person approves', () => {
    const snapshot = fixture('pr-67');
    snapshot.statuses.push({
      context: 'CodeRabbit',
      state: 'success',
      description: 'Review completed',
      created_at: '2026-10-07T15:55:00Z',
    });
    const review = (state: string, time: string): Review => ({
      id: 1,
      user: { login: 'afahy', type: 'User' },
      state,
      body: '',
      commit_id: '318c1b7f27c418c6a53ecf1c3de26c32ea207cb0',
      submitted_at: time,
      html_url: 'https://github.com/afahy/fluent-measures/pull/67#pullrequestreview-1',
    });
    snapshot.reviews.push(review('CHANGES_REQUESTED', '2026-10-07T15:56:00Z'));
    // A later comment doesn't withdraw the request.
    snapshot.reviews.push(review('COMMENTED', '2026-10-07T15:57:00Z'));
    expect(classify(snapshot, at('2026-10-07T16:00:00Z')).reasons).toEqual([
      'afahy requested changes: https://github.com/afahy/fluent-measures/pull/67#pullrequestreview-1',
    ]);
    snapshot.reviews.push(review('APPROVED', '2026-10-07T15:58:00Z'));
    expect(classify(snapshot, at('2026-10-07T16:00:00Z')).state).toBe('ready');
  });

  it('needs the agent for review comments outside the diff, until a person answers', () => {
    const snapshot = fixture('pr-67');
    snapshot.statuses.push({
      context: 'CodeRabbit',
      state: 'success',
      description: 'Review completed',
      created_at: '2026-10-07T15:55:00Z',
    });
    snapshot.reviews.push({
      id: 2,
      user: { login: 'coderabbitai[bot]', type: 'Bot' },
      state: 'COMMENTED',
      body: '**Actionable comments posted: 0**\n\n<summary>⚠️ Outside diff range comments (1)</summary>',
      commit_id: '318c1b7f27c418c6a53ecf1c3de26c32ea207cb0',
      submitted_at: '2026-10-07T15:54:00Z',
      html_url: 'https://github.com/afahy/fluent-measures/pull/67#pullrequestreview-2',
    });
    expect(classify(snapshot, at('2026-10-07T16:00:00Z')).reasons).toEqual([
      'coderabbitai[bot] put comments outside the diff in https://github.com/afahy/fluent-measures/pull/67#pullrequestreview-2. Answer in a PR comment that links to it.',
    ]);
    snapshot.issueComments.push({
      id: 3,
      user: { login: 'afahy', type: 'User' },
      body: 'Agent: https://github.com/afahy/fluent-measures/pull/67#pullrequestreview-2 is about code that this PR does not change.',
      created_at: '2026-10-07T15:58:00Z',
      updated_at: '2026-10-07T15:58:00Z',
      html_url: 'https://github.com/afahy/fluent-measures/pull/67#issuecomment-3',
    });
    expect(classify(snapshot, at('2026-10-07T16:00:00Z')).state).toBe('ready');
  });
});

describe('mostUrgent', () => {
  it('orders needs-agent, ready, merged, closed, waiting-human, then waiting', () => {
    expect(mostUrgent(['waiting', 'merged', 'needs-agent'])).toBe('needs-agent');
    expect(mostUrgent(['waiting', 'waiting-human', 'ready'])).toBe('ready');
    expect(mostUrgent(['waiting', 'closed', 'merged'])).toBe('merged');
    expect(mostUrgent(['waiting', 'waiting-human'])).toBe('waiting-human');
    expect(mostUrgent(['waiting'])).toBe('waiting');
  });
});

describe('createClient', () => {
  type Answer = { status: number; body?: unknown; headers?: Record<string, string> };

  type Call = { url: string; headers: Record<string, string> };

  function fakeFetch(answers: Record<string, Answer[]>): {
    calls: Call[];
    fetch: typeof globalThis.fetch;
  } {
    const calls: Call[] = [];
    const fetch = async (url: string, init: Call): Promise<Response> => {
      calls.push({ url, headers: init.headers });
      const answer = answers[url].shift()!;
      return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
        status: answer.status,
        headers: answer.headers,
      });
    };
    return { calls, fetch: fetch as unknown as typeof globalThis.fetch };
  }

  it('reads every page of a list, and of a list inside an object', async () => {
    const first = 'https://api.test/items?per_page=100';
    const second = 'https://api.test/items?per_page=100&page=2';
    const runs = 'https://api.test/runs?per_page=100';
    const { fetch } = fakeFetch({
      [first]: [{ status: 200, body: [1, 2], headers: { link: `<${second}>; rel="next"` } }],
      [second]: [{ status: 200, body: [3], headers: { link: `<${first}>; rel="prev"` } }],
      [runs]: [{ status: 200, body: { total_count: 1, check_runs: ['run'] } }],
    });
    const api = createClient({ apiUrl: 'https://api.test', fetch });
    await expect(api.getAll('/items')).resolves.toEqual([1, 2, 3]);
    await expect(api.getAll('/runs', 'check_runs')).resolves.toEqual(['run']);
  });

  it("sends the last ETag and reuses the answer when GitHub says it hasn't changed", async () => {
    const url = 'https://api.test/pull';
    const { calls, fetch } = fakeFetch({
      [url]: [{ status: 200, body: { n: 1 }, headers: { etag: '"abc"' } }, { status: 304 }],
    });
    const api = createClient({ token: 'secret', apiUrl: 'https://api.test', fetch });
    await expect(api.get('/pull')).resolves.toEqual({ n: 1 });
    await expect(api.get('/pull')).resolves.toEqual({ n: 1 });
    expect(calls[0].headers.Authorization).toBe('Bearer secret');
    expect(calls[0].headers['If-None-Match']).toBeUndefined();
    expect(calls[1].headers['If-None-Match']).toBe('"abc"');
  });

  // GitHub answers a used-up rate limit with a 403 or a 429.
  it.each([403, 429])(
    'says when the rate limit ends after a %s, and gives the reset time to retry at',
    async status => {
      const url = 'https://api.test/pull';
      const { fetch } = fakeFetch({
        [url]: [
          {
            status,
            body: { message: 'API rate limit exceeded' },
            headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1791400000' },
          },
        ],
      });
      const api = createClient({ apiUrl: 'https://api.test', fetch });
      await expect(api.get('/pull')).rejects.toMatchObject({
        message: "GitHub's rate limit is used up until 2026-10-07T19:06:40.000Z",
        retryAt: 1791400000000,
      });
    }
  );

  // AFA-147: an error says whether another try can help, and whether GitHub refused the token.
  it.each([
    ['a server error', { status: 503 }, { retryable: true, refused: false, retryAt: null }],
    ['a 401', { status: 401 }, { retryable: false, refused: true, retryAt: null }],
    [
      'a 403 that refuses the token',
      { status: 403, body: { message: 'Resource not accessible by integration' } },
      { retryable: false, refused: true, retryAt: null },
    ],
    ['a 404', { status: 404 }, { retryable: false, refused: false, retryAt: null }],
  ])('marks %s', async (_name, answer, marks) => {
    const url = 'https://api.test/pull';
    const { fetch } = fakeFetch({ [url]: [answer] });
    const api = createClient({ apiUrl: 'https://api.test', fetch });
    await expect(api.get('/pull')).rejects.toMatchObject({ status: answer.status, ...marks });
  });

  it.each([
    [
      'a 403 that names a secondary rate limit',
      { status: 403, body: { message: 'You have exceeded a secondary rate limit.' } },
      60_000,
    ],
    ['a 429', { status: 429 }, 60_000],
    [
      'a 429 with a Retry-After in seconds',
      { status: 429, headers: { 'retry-after': '5' } },
      5_000,
    ],
  ])('waits out %s', async (_name, answer, wait) => {
    const url = 'https://api.test/pull';
    const { fetch } = fakeFetch({ [url]: [answer] });
    const api = createClient({ apiUrl: 'https://api.test', fetch });
    const before = Date.now();
    const error = (await api.get('/pull').catch(e => e)) as { retryAt: number };
    expect(error).toMatchObject({ retryable: true, refused: false });
    expect(error.retryAt).toBeGreaterThanOrEqual(before + wait);
    expect(error.retryAt).toBeLessThanOrEqual(Date.now() + wait);
  });

  it('reads a Retry-After that gives a date', async () => {
    const url = 'https://api.test/pull';
    const date = 'Wed, 07 Oct 2026 19:06:40 GMT';
    const { fetch } = fakeFetch({ [url]: [{ status: 403, headers: { 'retry-after': date } }] });
    const api = createClient({ apiUrl: 'https://api.test', fetch });
    await expect(api.get('/pull')).rejects.toMatchObject({
      retryAt: 1791400000000,
      retryable: true,
      refused: false,
    });
  });

  it('marks a network error as one that another try can help', async () => {
    const fetch = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof globalThis.fetch;
    const api = createClient({ apiUrl: 'https://api.test', fetch });
    await expect(api.get('/pull')).rejects.toMatchObject({
      message: "GitHub didn't answer for https://api.test/pull: fetch failed",
      retryable: true,
      refused: false,
    });
  });

  // AFA-147, Codex on #114: a connection that drops while the body is read is a network error
  // too, for an answer that failed and for one that didn't.
  // AFA-148: only a 403's text can tell a rate limit from a refused token, so a 403 and a 429
  // whose body stops stay network errors too.
  it.each([200, 403, 429, 503])(
    'marks a %s whose body stops as one that another try can help',
    async status => {
      const fetch = (async () =>
        new Response(
          new ReadableStream({
            start(controller): void {
              controller.error(new TypeError('terminated'));
            },
          }),
          { status }
        )) as unknown as typeof globalThis.fetch;
      const api = createClient({ apiUrl: 'https://api.test', fetch });
      await expect(api.get('/pull')).rejects.toMatchObject({
        message: "GitHub didn't answer for https://api.test/pull: terminated",
        retryable: true,
        refused: false,
      });
    }
  );

  // AFA-147, Codex on #114: GitHub sends the rate-limit headers with every answer, so the last
  // request before the limit can get another error with them.
  it.each([
    [401, { retryable: false, refused: true }],
    [404, { retryable: false, refused: false }],
  ])('reads a %s with no requests left as that error', async (status, marks) => {
    const url = 'https://api.test/pull';
    const headers = { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1791400000' };
    const { fetch } = fakeFetch({ [url]: [{ status, body: { message: 'No' }, headers }] });
    const api = createClient({ apiUrl: 'https://api.test', fetch });
    await expect(api.get('/pull')).rejects.toMatchObject({
      message: `GitHub answered ${status} for ${url}: {"message":"No"}`,
      status,
      retryAt: null,
      ...marks,
    });
  });

  // AFA-148 item 8: a body that stops doesn't hide the status of an answer that isn't a server
  // error, so a refused token and a missing path still end the call.
  it.each([
    [401, { retryable: false, refused: true }],
    [404, { retryable: false, refused: false }],
  ])('reads a %s whose body stops by its status', async (status, marks) => {
    const fetch = (async () =>
      new Response(
        new ReadableStream({
          start(controller): void {
            controller.error(new TypeError('terminated'));
          },
        }),
        { status }
      )) as unknown as typeof globalThis.fetch;
    const api = createClient({ apiUrl: 'https://api.test', fetch });
    await expect(api.get('/pull')).rejects.toMatchObject({
      message: `GitHub answered ${status} for https://api.test/pull: `,
      status,
      retryAt: null,
      ...marks,
    });
  });

  // AFA-148 item 4: Node's fetch gives the reason for a network error as its cause.
  it('keeps the cause of a network error in its message', async () => {
    const cause = new Error('read ECONNRESET');
    const fetch = (async () => {
      throw new TypeError('fetch failed', { cause });
    }) as unknown as typeof globalThis.fetch;
    const api = createClient({ apiUrl: 'https://api.test', fetch });
    const error = (await api.get('/pull').catch(e => e)) as Error;
    expect(error.message).toBe(
      "GitHub didn't answer for https://api.test/pull: fetch failed (read ECONNRESET)"
    );
    expect((error.cause as Error).cause).toBe(cause);
  });

  // AFA-148 item 5: a proxy can answer 200 with a page that isn't JSON, and that can pass.
  it("marks a 200 whose body isn't JSON as one that another try can help", async () => {
    const fetch = (async () =>
      new Response('<html>', { status: 200 })) as unknown as typeof globalThis.fetch;
    const api = createClient({ apiUrl: 'https://api.test', fetch });
    await expect(api.get('/pull')).rejects.toMatchObject({
      message: "GitHub's answer for https://api.test/pull isn't JSON: <html>",
      retryable: true,
      refused: false,
      retryAt: null,
    });
  });

  // AFA-148 item 3: a bad URL can't pass, so the client rejects it before any request. Without
  // its scheme, "localhost:3000" would read as a URL with the scheme "localhost:".
  it.each(['not-a-url', 'localhost:3000', 'api.github.com:443', 'ftp://api.github.com'])(
    'rejects the API URL %s',
    apiUrl => {
      expect(() => createClient({ apiUrl })).toThrow(
        `The GitHub API URL isn't an http or https URL: ${apiUrl}`
      );
    }
  );

  it('reports any other error with its status', async () => {
    const url = 'https://api.test/pull';
    const { fetch } = fakeFetch({ [url]: [{ status: 404, body: { message: 'Not Found' } }] });
    const api = createClient({ apiUrl: 'https://api.test', fetch });
    await expect(api.get('/pull')).rejects.toMatchObject({
      message: `GitHub answered 404 for ${url}: {"message":"Not Found"}`,
      status: 404,
    });
  });
});
