import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { env as parentEnv, execPath } from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';
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
      "waiting: Codex hasn't started on c7ad2f4; its last review was of 91a5d29 (until 2026-10-07T15:30:44.000Z)"
    );
    expect(describeStatus(classify(fixture('pr-66'), at('2026-10-07T17:01:00Z')))).toBe(
      'waiting-human: Codex never reviewed the head commit, so only the maintainer can merge it'
    );
    expect(describeStatus(classify(ready67(), at('2026-10-07T16:00:00Z')))).toBe(
      'ready: Nothing is left for the agent'
    );
  });

  it('drops a link that follows "in"', () => {
    const status = classify(ready67(), at('2026-10-07T16:00:00Z'));
    const outside: PrStatus = {
      ...status,
      state: 'needs-agent',
      reasons: [
        'coderabbitai[bot] put comments outside the diff in https://github.com/afahy/fluent-measures/pull/67#pullrequestreview-1',
      ],
    };
    expect(describeStatus(outside)).toBe(
      'needs-agent: coderabbitai[bot] put comments outside the diff'
    );
    const bare: PrStatus = { ...outside, reasons: ['See https://github.com/afahy'] };
    expect(describeStatus(bare)).toBe('needs-agent: See');
  });

  it('keeps the description to 140 characters', () => {
    const status = classify(ready67(), at('2026-10-07T16:00:00Z'));
    const long: PrStatus = { ...status, state: 'waiting-human', reasons: ['x'.repeat(200)] };
    expect(describeStatus(long)).toBe(`waiting-human: ${'x'.repeat(124)}…`);
    // 15 + 125 is exactly 140, so nothing is cut.
    const full: PrStatus = { ...long, reasons: ['x'.repeat(125)] };
    expect(describeStatus(full)).toBe(`waiting-human: ${'x'.repeat(125)}`);
  });

  // GitHub answered 422, "Description doesn't accept 4-byte Unicode", to a status with the 👀
  // (AFA-108).
  it('drops each character outside the Basic Multilingual Plane, and the brackets around it', () => {
    const snapshot = fixture('pr-66');
    snapshot.reactions.push({
      user: { login: 'chatgpt-codex-connector[bot]', type: 'Bot' },
      content: 'eyes',
      created_at: '2026-10-07T15:10:00Z',
    });
    // At 15:20 the first wait was "Codex hasn't started" (above). After the 👀, it is
    // "Codex is reviewing (👀)". CodeRabbit is rate limited, so it adds no other wait.
    expect(describeStatus(classify(snapshot, at('2026-10-07T15:20:00Z')))).toBe(
      'waiting: Codex is reviewing'
    );
    const status = classify(ready67(), at('2026-10-07T16:00:00Z'));
    const emoji: PrStatus = { ...status, state: 'waiting-human', reasons: ['👍'.repeat(200)] };
    expect(describeStatus(emoji)).toBe('waiting-human');
    // The 👍s are dropped before the length check, so 15 + 125 characters fit with no cut.
    const mixed: PrStatus = { ...emoji, reasons: [`${'👍'.repeat(5)}${'x'.repeat(125)}`] };
    expect(describeStatus(mixed)).toBe(`waiting-human: ${'x'.repeat(125)}`);
    // A character in the plane, such as ✅ (U+2705), stays.
    const check: PrStatus = { ...emoji, reasons: ['✅ (ok)'] };
    expect(describeStatus(check)).toBe('waiting-human: ✅ (ok)');
  });

  it('leaves no extra spaces, joiners, other brackets or lone surrogates', () => {
    const status = classify(ready67(), at('2026-10-07T16:00:00Z'));
    const describe = (reason: string): string =>
      describeStatus({ ...status, state: 'waiting-human', reasons: [reason] });
    expect(describe("Codex's review of abc is 🔄 Running")).toBe(
      "waiting-human: Codex's review of abc is Running"
    );
    expect(describe('call parseMeasurement() first (👀)')).toBe(
      'waiting-human: call parseMeasurement() first'
    );
    // 👨‍💻 is 👨, a zero-width joiner and 💻. In ❤️‍🔥, only 🔥 is outside the plane, so ❤️
    // (U+2764 and U+FE0F) stays without the joiner.
    expect(describe('👨\u200D💻 (❤\uFE0F\u200D🔥) done')).toBe('waiting-human: (❤\uFE0F) done');
    expect(describe('\uD83D x')).toBe('waiting-human: x');
    expect(describe('one 👍, two')).toBe('waiting-human: one, two');
    // Spaces that weren't next to a dropped character stay as they are.
    expect(describe('a  b 👀')).toBe('waiting-human: a  b');
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
    async getAll(path: string): Promise<unknown[]> {
      this.paths.push(path);
      return [{ number: 7 }, { number: 8 }];
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

  it("finds the open PRs for a commit's status, or a fork's PRs by the run's branch", async () => {
    api.paths = [];
    await expect(prsForEvent(api, repo, 'status', { sha: 'abc' })).resolves.toEqual([5]);
    // A run for a fork's PR lists no PRs, and GitHub can't find them by the fork's commit.
    await expect(
      prsForEvent(api, repo, 'workflow_run', {
        workflow_run: {
          pull_requests: [],
          head_sha: 'def',
          head_branch: 'fix/units',
          head_repository: { owner: { login: 'someone' } },
        },
      })
    ).resolves.toEqual([7, 8]);
    await expect(
      prsForEvent(api, repo, 'workflow_run', {
        workflow_run: { pull_requests: [{ number: 9 }], head_sha: 'ghi' },
      })
    ).resolves.toEqual([9]);
    expect(api.paths).toEqual([
      `/repos/${repo}/commits/abc/pulls`,
      `/repos/${repo}/pulls?state=open&head=someone%3Afix%2Funits`,
    ]);
  });

  it('checks every open PR on a schedule or when started by hand', async () => {
    api.paths = [];
    await expect(prsForEvent(api, repo, 'schedule', {})).resolves.toEqual([7, 8]);
    await expect(prsForEvent(api, repo, 'workflow_dispatch', {})).resolves.toEqual([7, 8]);
    expect(api.paths).toEqual([
      `/repos/${repo}/pulls?state=open`,
      `/repos/${repo}/pulls?state=open`,
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
        state: 'pending',
        description: 'waiting: an older status',
        created_at: '2026-10-07T15:58:00Z',
      },
      {
        context: 'pr-status',
        state: 'success',
        description: 'ready: Nothing is left for the agent',
        created_at: '2026-10-07T15:59:00Z',
      },
      // A newer status from another context isn't the PR's status.
      {
        context: 'CodeRabbit',
        state: 'success',
        description: 'Review completed',
        created_at: '2026-10-07T15:59:30Z',
      }
    );
    expect(classify(snapshot, at('2026-10-07T16:00:00Z')).state).toBe('ready');
    const { posts, post } = recorder();
    await expect(
      setStatus(fakeApi(snapshot), post, repo, 67, at('2026-10-07T16:00:00Z'))
    ).resolves.toBeNull();
    expect(posts).toEqual([]);
  });

  it("doesn't count its own status or its own workflow's check as CI", () => {
    const snapshot = ready67();
    snapshot.statuses.push({
      context: 'pr-status',
      state: 'pending',
      description: 'waiting: CI is running: mutation',
      created_at: '2026-10-07T15:59:00Z',
    });
    snapshot.checkRuns.push(
      {
        id: 1,
        name: 'Set the PR status',
        status: 'completed',
        conclusion: 'cancelled',
        started_at: '2026-10-07T15:58:00Z',
        app: { slug: 'github-actions' },
      },
      {
        id: 2,
        name: 'Set the PR status',
        status: 'in_progress',
        conclusion: null,
        started_at: '2026-10-07T15:59:00Z',
        app: { slug: 'github-actions' },
      }
    );
    const status = classify(snapshot, at('2026-10-07T16:00:00Z'));
    expect(status.state).toBe('ready');
    expect(status.ci.pending).toEqual([]);
    expect(status.ci.failed).toEqual([]);
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

  it.each([
    // [fixture, time, commit state, description], from the describeStatus cases above.
    [
      'pr-43-at-1810',
      '2026-10-05T18:10:00Z',
      'failure',
      'needs-agent: chatgpt-codex-connector[bot] left a thread with no reply (+1 more)',
    ],
    [
      'pr-66',
      '2026-10-07T15:20:00Z',
      'pending',
      "waiting: Codex hasn't started on c7ad2f4; its last review was of 91a5d29 (until 2026-10-07T15:30:44.000Z)",
    ],
    // AFA-125: a PR that waits only for the maintainer shows a green check, and the description
    // says what the maintainer needs to do.
    [
      'pr-66',
      '2026-10-07T17:01:00Z',
      'success',
      'waiting-human: Codex never reviewed the head commit, so only the maintainer can merge it',
    ],
  ])('sets %s at %s to %s', async (name, time, state, description) => {
    const { posts, post } = recorder();
    const snapshot = fixture(name);
    await setStatus(fakeApi(snapshot), post, repo, snapshot.pull.number, at(time));
    expect(posts).toEqual([
      [
        `/repos/${repo}/statuses/${snapshot.pull.head.sha}`,
        { state, context: 'pr-status', description, target_url: snapshot.pull.html_url },
      ],
    ]);
  });

  // AFA-125 review: a draft waits for the maintainer, but it stays pending while its CI runs.
  it('keeps a draft pending while its CI runs, and sets success when CI is done', async () => {
    const snapshot = fixture('pr-67');
    snapshot.pull.draft = true;
    snapshot.checkRuns.push({
      id: 99,
      name: 'a check that still runs',
      status: 'in_progress',
      conclusion: null,
      started_at: '2026-10-07T15:59:00Z',
      app: { slug: 'github-actions' },
    });
    const running = recorder();
    await setStatus(fakeApi(snapshot), running.post, repo, 67, at('2026-10-07T16:00:00Z'));
    expect(running.posts[0][1]).toMatchObject({
      state: 'pending',
      description: 'waiting-human: The PR is a draft',
    });
    snapshot.checkRuns.pop();
    const done = recorder();
    await setStatus(fakeApi(snapshot), done.post, repo, 67, at('2026-10-07T16:00:00Z'));
    expect(done.posts[0][1]).toMatchObject({
      state: 'success',
      description: 'waiting-human: The PR is a draft',
    });
  });

  it('leaves a merged PR alone', async () => {
    const { posts, post } = recorder();
    await expect(
      setStatus(fakeApi(fixture('pr-43')), post, repo, 43, at('2026-10-07T16:00:00Z'))
    ).resolves.toBeNull();
    expect(posts).toEqual([]);
  });
});

describe('pr-status-check.mjs', () => {
  const servers: Server[] = [];
  afterEach(() => {
    for (const server of servers.splice(0)) server.close();
  });

  /** Serves #67 the way GitHub's REST API does, and records each status it is sent. */
  async function serve(postCode: number): Promise<{
    url: string;
    posts: { path: string; headers: IncomingHttpHeaders; body: unknown }[];
  }> {
    const snapshot = ready67();
    const sha = snapshot.pull.head.sha;
    const base = `/repos/${repo}`;
    const routes: Record<string, unknown> = {
      // Open PRs, for a scheduled run. #66 has no routes, so reading it answers 404.
      [`${base}/pulls`]: [{ number: 66 }, { number: 67 }],
      [`${base}/pulls/67`]: snapshot.pull,
      [`/repos/${snapshot.pull.head.repo?.full_name}/activity`]: snapshot.pushes,
      [`${base}/issues/67/events`]: snapshot.events,
      [`${base}/git/commits/${sha}`]: snapshot.headCommit,
      [`${base}/commits/${sha}/check-runs`]: {
        total_count: snapshot.checkRuns.length,
        check_runs: snapshot.checkRuns,
      },
      [`${base}/commits/${sha}/statuses`]: snapshot.statuses,
      [`${base}/issues/67/comments`]: snapshot.issueComments,
      [`${base}/pulls/67/reviews`]: snapshot.reviews,
      [`${base}/pulls/67/comments`]: snapshot.reviewComments,
      [`${base}/issues/67/reactions`]: snapshot.reactions,
    };
    const posts: { path: string; headers: IncomingHttpHeaders; body: unknown }[] = [];
    const server = createServer((request, response) => {
      const path = new URL(request.url ?? '', 'http://localhost').pathname;
      let text = '';
      request.on('data', chunk => (text += chunk));
      request.on('end', () => {
        if (request.method === 'POST') {
          posts.push({ path, headers: request.headers, body: JSON.parse(text) });
          response.writeHead(postCode, { 'Content-Type': 'application/json' });
          response.end('{}');
          return;
        }
        const body = routes[path];
        response.writeHead(body === undefined ? 404 : 200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(body ?? { message: 'Not Found' }));
      });
    });
    servers.push(server);
    await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
    return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, posts };
  }

  /** Runs the script for a pull_request event on #67, without the proxy that cloud sessions set. */
  function run(
    apiUrl: string,
    name = 'pull_request',
    event: unknown = { pull_request: { number: 67 } }
  ): Promise<{ code: number | null; stdout: string; stderr: string }> {
    const dir = mkdtempSync(join(tmpdir(), 'pr-status-check-'));
    const eventPath = join(dir, 'event.json');
    writeFileSync(eventPath, JSON.stringify(event));
    const env: Record<string, string | undefined> = { ...parentEnv };
    for (const name of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy']) delete env[name];
    Object.assign(env, {
      GITHUB_API_URL: apiUrl,
      GITHUB_TOKEN: 'test-token',
      GITHUB_REPOSITORY: repo,
      GITHUB_EVENT_NAME: name,
      GITHUB_EVENT_PATH: eventPath,
    });
    return new Promise(done => {
      execFile(
        execPath,
        [resolve('.github/scripts/pr-status-check.mjs')],
        { env },
        (error, stdout, stderr) =>
          done({ code: error ? (error.code as number) : 0, stdout, stderr })
      );
    });
  }

  it("posts the PR's status with the token and prints what it set", async () => {
    const api = await serve(201);
    const result = await run(api.url);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('#67: success, ready: Nothing is left for the agent\n');
    expect(api.posts).toHaveLength(1);
    const [sent] = api.posts;
    expect(sent.path).toBe(`/repos/${repo}/statuses/318c1b7f27c418c6a53ecf1c3de26c32ea207cb0`);
    expect(sent.headers).toMatchObject({
      accept: 'application/vnd.github+json',
      authorization: 'Bearer test-token',
      'x-github-api-version': '2022-11-28',
      'content-type': 'application/json',
    });
    expect(sent.body).toEqual({
      state: 'success',
      context: 'pr-status',
      description: 'ready: Nothing is left for the agent',
      target_url: 'https://github.com/afahy/fluent-measures/pull/67',
    });
  });

  it('sets the other PRs when one fails, then fails the run', async () => {
    const api = await serve(201);
    const result = await run(api.url, 'schedule', {});
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('#67: success, ready: Nothing is left for the agent\n');
    expect(result.stderr).toContain(
      `#66: GitHub answered 404 for ${api.url}/repos/${repo}/pulls/66`
    );
    expect(api.posts).toHaveLength(1);
  });

  it('fails when GitHub refuses the status', async () => {
    const api = await serve(403);
    const result = await run(api.url);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      `POST /repos/${repo}/statuses/318c1b7f27c418c6a53ecf1c3de26c32ea207cb0 answered 403`
    );
  });
});
