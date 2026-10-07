import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { PrStatus, Snapshot } from '../.github/scripts/pr-state.mjs';
import { classify } from '../.github/scripts/pr-state.mjs';
import { describeStatus, prsForEvent, setStatus } from '../.github/scripts/pr-status-check.mjs';

// The fixtures and times are the ones in prState.test.ts. Every expected value was worked out
// by hand from them.
function fixture(name: string): Snapshot {
  return JSON.parse(readFileSync(`tests/fixtures/pr-status/${name}.json`, 'utf8'));
}

const at = (time: string): number => Date.parse(time);
const repo = 'afahy/fluent-measures';

/** #67 after CodeRabbit's review completed, which makes it ready. */
function ready67(): Snapshot {
  const snapshot = fixture('pr-67');
  snapshot.statuses.push({
    context: 'CodeRabbit',
    state: 'success',
    description: 'Review completed',
    created_at: '2026-10-07T15:55:00Z',
  });
  return snapshot;
}

describe('describeStatus', () => {
  it('gives the state and the first reason or wait, without its link, and counts the rest', () => {
    expect(describeStatus(classify(fixture('pr-43-at-1810'), at('2026-10-05T18:10:00Z')))).toBe(
      'needs-agent: chatgpt-codex-connector[bot] left a thread with no reply (+1 more)'
    );
    expect(describeStatus(classify(fixture('pr-66'), at('2026-10-07T15:31:00Z')))).toBe(
      "needs-agent: Codex hasn't reviewed c7ad2f4 30 minutes after it could start; its last review was of 91a5d29"
    );
    expect(describeStatus(classify(fixture('pr-66'), at('2026-10-07T15:20:00Z')))).toBe(
      "waiting: Codex hasn't started on c7ad2f4; its last review was of 91a5d29 (until 2026-10-07T15:30:44.000Z) (+1 more)"
    );
    expect(describeStatus(classify(fixture('pr-66'), at('2026-10-07T17:01:00Z')))).toBe(
      'waiting-human: Codex never reviewed the head commit, so only the maintainer can merge it'
    );
    expect(describeStatus(classify(ready67(), at('2026-10-07T16:00:00Z')))).toBe(
      'ready: Nothing is left for the agent'
    );
  });

  it('keeps the description to 140 characters', () => {
    const status = classify(ready67(), at('2026-10-07T16:00:00Z'));
    const long: PrStatus = { ...status, state: 'waiting-human', reasons: ['x'.repeat(200)] };
    expect(describeStatus(long)).toBe(`waiting-human: ${'x'.repeat(124)}…`);
  });

  it("says only the state when there's nothing to name", () => {
    const status = classify(ready67(), at('2026-10-07T16:00:00Z'));
    expect(describeStatus({ ...status, state: 'needs-agent', reasons: [] })).toBe('needs-agent');
  });
});

describe('prsForEvent', () => {
  const api = {
    paths: [] as string[],
    async get(path: string): Promise<unknown> {
      this.paths.push(path);
      return [
        { number: 5, state: 'open' },
        { number: 6, state: 'closed' },
      ];
    },
    async getAll(): Promise<unknown[]> {
      return [];
    },
  };

  it('reads the PR from PR events and from comments on PRs only', async () => {
    for (const name of ['pull_request', 'pull_request_review', 'pull_request_review_comment']) {
      await expect(prsForEvent(api, repo, name, { pull_request: { number: 3 } })).resolves.toEqual([
        3,
      ]);
    }
    await expect(
      prsForEvent(api, repo, 'issue_comment', { issue: { number: 4, pull_request: {} } })
    ).resolves.toEqual([4]);
    await expect(
      prsForEvent(api, repo, 'issue_comment', { issue: { number: 4 } })
    ).resolves.toEqual([]);
    await expect(prsForEvent(api, repo, 'push', {})).resolves.toEqual([]);
  });

  it("finds the open PRs for a commit's status, or for a workflow run that lists none", async () => {
    api.paths = [];
    await expect(prsForEvent(api, repo, 'status', { sha: 'abc' })).resolves.toEqual([5]);
    await expect(
      prsForEvent(api, repo, 'workflow_run', {
        workflow_run: { pull_requests: [], head_sha: 'def' },
      })
    ).resolves.toEqual([5]);
    await expect(
      prsForEvent(api, repo, 'workflow_run', {
        workflow_run: { pull_requests: [{ number: 9 }], head_sha: 'ghi' },
      })
    ).resolves.toEqual([9]);
    expect(api.paths).toEqual([
      `/repos/${repo}/commits/abc/pulls`,
      `/repos/${repo}/commits/def/pulls`,
    ]);
  });
});

describe('setStatus', () => {
  /** Serves a snapshot by the paths that collect() reads. */
  function fakeApi(snapshot: Snapshot): {
    get(path: string): Promise<unknown>;
    getAll(path: string): Promise<unknown[]>;
  } {
    return {
      async get(path: string): Promise<unknown> {
        if (path.includes('/pulls/')) return snapshot.pull;
        if (path.includes('/activity')) return snapshot.pushes;
        return snapshot.headCommit;
      },
      async getAll(path: string): Promise<unknown[]> {
        if (path.endsWith('/events')) return snapshot.events;
        if (path.endsWith('/check-runs')) return snapshot.checkRuns;
        if (path.endsWith('/statuses')) return snapshot.statuses;
        if (path.endsWith('/reviews')) return snapshot.reviews;
        if (path.endsWith('/reactions')) return snapshot.reactions;
        if (path.includes('/pulls/')) return snapshot.reviewComments;
        return snapshot.issueComments;
      },
    };
  }

  function recorder(): {
    posts: [string, unknown][];
    post: (path: string, body: unknown) => Promise<unknown>;
  } {
    const posts: [string, unknown][] = [];
    return { posts, post: async (path, body) => posts.push([path, body]) };
  }

  it('sets the status on the head commit when it has none', async () => {
    const { posts, post } = recorder();
    const set = await setStatus(fakeApi(ready67()), post, repo, 67, at('2026-10-07T16:00:00Z'));
    expect(set).toEqual({ state: 'success', description: 'ready: Nothing is left for the agent' });
    expect(posts).toEqual([
      [
        `/repos/${repo}/statuses/318c1b7f27c418c6a53ecf1c3de26c32ea207cb0`,
        {
          state: 'success',
          context: 'pr-status',
          description: 'ready: Nothing is left for the agent',
          target_url: 'https://github.com/afahy/fluent-measures/pull/67',
        },
      ],
    ]);
  });

  it("doesn't count its own status as CI, and sets nothing when the newest one is the same", async () => {
    const snapshot = ready67();
    snapshot.statuses.push(
      {
        context: 'pr-status',
        state: 'success',
        description: 'ready: Nothing is left for the agent',
        created_at: '2026-10-07T15:59:00Z',
      },
      {
        context: 'pr-status',
        state: 'pending',
        description: 'waiting: an older status',
        created_at: '2026-10-07T15:58:00Z',
      }
    );
    expect(classify(snapshot, at('2026-10-07T16:00:00Z')).state).toBe('ready');
    const { posts, post } = recorder();
    await expect(
      setStatus(fakeApi(snapshot), post, repo, 67, at('2026-10-07T16:00:00Z'))
    ).resolves.toBeNull();
    expect(posts).toEqual([]);
  });

  it('sets the status again when the state or description changed', async () => {
    const snapshot = ready67();
    snapshot.statuses.push({
      context: 'pr-status',
      state: 'success',
      description: 'ready: an older description',
      created_at: '2026-10-07T15:59:00Z',
    });
    const { posts, post } = recorder();
    await setStatus(fakeApi(snapshot), post, repo, 67, at('2026-10-07T16:00:00Z'));
    expect(posts).toHaveLength(1);
    snapshot.statuses.push({
      context: 'pr-status',
      state: 'pending',
      description: 'ready: Nothing is left for the agent',
      created_at: '2026-10-07T15:59:30Z',
    });
    await setStatus(fakeApi(snapshot), post, repo, 67, at('2026-10-07T16:00:00Z'));
    expect(posts).toHaveLength(2);
  });

  it('leaves a merged PR alone', async () => {
    const { posts, post } = recorder();
    await expect(
      setStatus(fakeApi(fixture('pr-43')), post, repo, 43, at('2026-10-07T16:00:00Z'))
    ).resolves.toBeNull();
    expect(posts).toEqual([]);
  });
});
