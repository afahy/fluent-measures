import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { env as parentEnv, execPath } from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';
import type { Snapshot } from '../.github/scripts/pr-state.mjs';

const script = resolve('.github/scripts/pr-status.mjs');
const repo = 'afahy/fluent-measures';
const servers: Server[] = [];

afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

function fixture(name: string): Snapshot {
  return JSON.parse(readFileSync(`tests/fixtures/pr-status/${name}.json`, 'utf8'));
}

/** An error answer for one request, with its status and headers. */
type Failure = { status: number; headers?: Record<string, string> };

/**
 * Serves a PR's responses the way GitHub's REST API does. `snapshots` gives the answer to each
 * poll in turn; the last one repeats. `failures` answers the first requests for the PR instead,
 * except where it has no entry.
 */
async function serve(
  snapshots: Snapshot[],
  failures: (Failure | undefined)[] = []
): Promise<{ url: string; polls: () => number; hits: (end: string) => number }> {
  let polls = 0;
  let requests = 0;
  const paths: string[] = [];
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '', 'http://localhost').pathname;
    paths.push(path);
    const base = `/repos/${repo}`;
    if (path.endsWith('/pulls/43')) {
      const failure = failures[requests++];
      if (failure) {
        response.writeHead(failure.status, {
          'Content-Type': 'application/json',
          ...failure.headers,
        });
        response.end(JSON.stringify({ message: 'Failed' }));
        return;
      }
      polls++;
    }
    const s = snapshots[Math.min(polls, snapshots.length) - 1];
    const sha = s?.pull.head.sha;
    const routes: Record<string, unknown> = {
      [`${base}/pulls/43`]: s?.pull,
      [`${base}/activity`]: s?.pushes,
      [`${base}/issues/43/events`]: s?.events,
      [`${base}/git/commits/${sha}`]: s?.headCommit,
      [`${base}/commits/${sha}/check-runs`]: {
        total_count: s?.checkRuns.length,
        check_runs: s?.checkRuns,
      },
      [`${base}/commits/${sha}/statuses`]: s?.statuses,
      [`${base}/issues/43/comments`]: s?.issueComments,
      [`${base}/pulls/43/reviews`]: s?.reviews,
      [`${base}/pulls/43/comments`]: s?.reviewComments,
      [`${base}/issues/43/reactions`]: s?.reactions,
    };
    const body = routes[path];
    response.writeHead(body === undefined ? 404 : 200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body ?? { message: 'Not Found' }));
  });
  servers.push(server);
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    polls: () => polls,
    hits: end => paths.filter(path => path.endsWith(end)).length,
  };
}

/** Runs pr-status.mjs against a fake API, without the proxy that cloud sessions set. */
function run(
  apiUrl: string,
  args: string[]
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const env: Record<string, string | undefined> = { ...parentEnv };
  for (const name of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy']) delete env[name];
  Object.assign(env, { GITHUB_API_URL: apiUrl, GH_TOKEN: 'test', GITHUB_REPOSITORY: repo });
  return new Promise(done => {
    execFile(execPath, [script, ...args], { env }, (error, stdout, stderr) => {
      done({ code: error ? (error.code as number) : 0, stdout, stderr });
    });
  });
}

/** #43 at 18:10 on 2026-10-05, with both bot threads answered, so only the merge is left. */
function answered(): Snapshot {
  const snapshot = fixture('pr-43-at-1810');
  for (const id of [4187121862, 4187191635]) {
    snapshot.reviewComments.push({
      id: id + 1,
      user: { login: 'afahy', type: 'User' },
      in_reply_to_id: id,
      created_at: '2026-10-05T18:09:30Z',
      html_url: `https://github.com/${repo}/pull/43#discussion_r${id + 1}`,
    });
  }
  return snapshot;
}

describe('pr-status.mjs', () => {
  it('prints what the PR needs and exits with the needs-agent code', async () => {
    const api = await serve([fixture('pr-43-at-1810')]);
    const result = await run(api.url, ['43']);
    expect(result.code).toBe(10);
    expect(result.stdout).toContain('#43 needs-agent: fix: read the number after any unit label');
    expect(result.stdout).toContain('  Head 333a541, pushed 2026-10-05T17:51:02Z');
    expect(result.stdout).toContain('  GitHub merge state: clean');
    expect(result.stdout).toContain('  CI: 11 passed');
    expect(result.stdout).toContain(
      `    - chatgpt-codex-connector[bot] left a thread with no reply: https://github.com/${repo}/pull/43#discussion_r4187121862`
    );
  });

  it('prints JSON with --json', async () => {
    const api = await serve([answered()]);
    const result = await run(api.url, ['#43', '--json']);
    // Both bots reviewed 333a541 and CI passed, so nothing is left for the agent.
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      expect.objectContaining({
        pr: 43,
        state: 'ready',
        head: '333a541a23a7202e471f558968e08b42f8cd6468',
      }),
    ]);
  });

  it('with --wait, stays quiet while the PR waits on a person and returns when it merges', async () => {
    const blocked = answered();
    blocked.pull.mergeable_state = 'blocked';
    const merged = answered();
    Object.assign(merged.pull, {
      state: 'closed',
      merged: true,
      merged_at: '2026-10-05T18:30:00Z',
    });
    const api = await serve([blocked, blocked, merged]);
    const result = await run(api.url, ['43', '--wait', '--interval', '1']);
    expect(result.code).toBe(40);
    expect(api.polls()).toBe(3);
    expect(result.stdout.split('\n')[0]).toBe('After 0 min: #43 is now merged.');
  });

  it('accepts --no-requests', async () => {
    const api = await serve([fixture('pr-43-at-1810')]);
    const result = await run(api.url, ['43', '--no-requests']);
    expect(result.code).toBe(10);
  });

  it('with --wait, returns at once when the PR already needs the agent', async () => {
    const api = await serve([fixture('pr-43-at-1810')]);
    const result = await run(api.url, ['43', '--wait', '--interval', '1']);
    expect(result.code).toBe(10);
    expect(api.polls()).toBe(1);
  });

  // AFA-147: with --wait, the first request is tried again after an error that can pass, as
  // later polls are.
  it.each([
    ['a server error', { status: 503 }],
    ['a secondary rate limit', { status: 403, headers: { 'retry-after': '1' } }],
  ])('with --wait, tries its first request again after %s', async (_name, failure) => {
    const api = await serve([fixture('pr-43-at-1810')], [failure]);
    const result = await run(api.url, ['43', '--wait', '--interval', '1']);
    expect(result.code).toBe(10);
    expect(api.polls()).toBe(1);
    expect(result.stdout).toContain('#43 needs-agent');
  });

  // AFA-147: another try can't find a PR that isn't there, so --wait doesn't make one.
  it('with --wait, exits with 1 at once for a 404', async () => {
    const api = await serve([fixture('pr-43-at-1810')]);
    const result = await run(api.url, ['44', '--wait', '--interval', '1']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('GitHub answered 404');
    expect(api.hits('/pulls/44')).toBe(1);
  });

  // AFA-147: a Retry-After on a server error doesn't make it a rate limit, so five in a row end
  // the call. The four waits of --interval take 4 s, so the test gets more than Vitest's 5 s.
  it(
    'with --wait, exits with 1 after five server errors in a row',
    { timeout: 20_000 },
    async () => {
      const failure = { status: 503, headers: { 'retry-after': '1' } };
      const api = await serve([fixture('pr-43-at-1810')], Array(10).fill(failure));
      const result = await run(api.url, ['43', '--wait', '--interval', '1']);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('GitHub answered 503');
      expect(api.hits('/pulls/43')).toBe(5);
    }
  );

  // AFA-147: when --timeout ends before a poll gets through, the call says what GitHub answered.
  it('with --wait, gives the last error when no poll gets through in time', async () => {
    const api = await serve([fixture('pr-43-at-1810')], Array(10).fill({ status: 503 }));
    const result = await run(api.url, ['43', '--wait', '--interval', '1', '--timeout', '0.02']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('GitHub answered 503');
    expect(api.hits('/pulls/43')).toBeLessThan(5);
  });

  // AFA-147: a rate limit that ends after --timeout can't be waited out, so the call ends at once.
  it('with --wait, exits with 1 at once for a rate limit that lasts past --timeout', async () => {
    const reset = String(Math.floor(Date.now() / 1000) + 3600);
    const failure = {
      status: 403,
      headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset },
    };
    const api = await serve([fixture('pr-43-at-1810')], [failure]);
    const result = await run(api.url, ['43', '--wait', '--interval', '1', '--timeout', '1']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("GitHub's rate limit is used up until");
    expect(api.hits('/pulls/43')).toBe(1);
  });

  // AFA-147, CodeRabbit on #114: a reset time that has passed counts as an error, so five in a row
  // end the call. Its four waits of --interval take 4 s too.
  it(
    'with --wait, exits with 1 after five rate limits whose reset time has passed',
    { timeout: 20_000 },
    async () => {
      const reset = String(Math.floor(Date.now() / 1000) - 60);
      const failure = {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset },
      };
      const api = await serve([fixture('pr-43-at-1810')], Array(10).fill(failure));
      const result = await run(api.url, ['43', '--wait', '--interval', '1']);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("GitHub's rate limit is used up until");
      expect(api.hits('/pulls/43')).toBe(5);
    }
  );

  it('without --wait, exits with 1 at once for a server error', async () => {
    const api = await serve([fixture('pr-43-at-1810')], [{ status: 503 }]);
    const result = await run(api.url, ['43']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('GitHub answered 503');
    expect(api.polls()).toBe(0);
  });

  // AFA-147: another try won't help a refused token, so it gets its own exit code at once.
  it.each([401, 403])(
    'exits with 3 for a %s that refuses the token, even with --wait',
    async status => {
      const api = await serve([fixture('pr-43-at-1810')], [{ status }]);
      const result = await run(api.url, ['43', '--wait', '--interval', '1']);
      expect(result.code).toBe(3);
      expect(result.stderr).toContain(`GitHub answered ${status}`);
      expect(result.stderr).toContain('GitHub refused the token');
      expect(api.polls()).toBe(0);
    }
  );

  // AFA-148 item 1: a rate limit that lasts past --timeout ends a call that has a result with that
  // result, as before AFA-147, not with exit 1.
  it('with --wait, prints the last result when a later rate limit lasts past --timeout', async () => {
    const blocked = answered();
    blocked.pull.mergeable_state = 'blocked';
    const limit = { status: 429, headers: { 'retry-after': '3600' } };
    const api = await serve([blocked], [undefined, limit]);
    const result = await run(api.url, ['43', '--wait', '--interval', '1', '--timeout', '0.05']);
    expect(result.code).toBe(30);
    expect(result.stdout.split('\n')[0]).toBe('Nothing changed in 0.05 min.');
    expect(api.hits('/pulls/43')).toBe(2);
  });

  // AFA-148 item 2: after a rate limit ends, the next try still waits --interval. Here a try at
  // 0 s and one at 2 s fail, and the next would come after the 3 s --timeout.
  it('with --wait, waits at least --interval after a short rate limit', async () => {
    const limit = { status: 429, headers: { 'retry-after': '1' } };
    const api = await serve([fixture('pr-43-at-1810')], Array(10).fill(limit));
    const result = await run(api.url, ['43', '--wait', '--interval', '2', '--timeout', '0.05']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('GitHub answered 429');
    expect(api.hits('/pulls/43')).toBe(2);
  });

  // AFA-148 item 9: rate limits count toward the five errors in a row, so a limit that keeps
  // coming back ends the call. Its four waits of --interval take 4 s.
  it('with --wait, exits with 1 after five rate limits in a row', { timeout: 20_000 }, async () => {
    const limit = { status: 429, headers: { 'retry-after': '1' } };
    const api = await serve([fixture('pr-43-at-1810')], Array(10).fill(limit));
    const result = await run(api.url, ['43', '--wait', '--interval', '1', '--timeout', '1']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('GitHub answered 429');
    expect(api.hits('/pulls/43')).toBe(5);
  });

  // AFA-148 item 3: another try can't fix a bad URL, so the call ends before its first request.
  it("with --wait, exits with 1 at once for an API URL that isn't a URL", async () => {
    const result = await run('not-a-url', ['43', '--wait', '--interval', '1']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("The GitHub API URL isn't a URL: not-a-url");
  });

  it('exits with 2 and the usage for a bad argument, and 1 for an API error', async () => {
    const api = await serve([fixture('pr-43-at-1810')]);
    const usage = await run(api.url, ['--wait']);
    expect(usage.code).toBe(2);
    expect(usage.stderr).toContain('Usage: pnpm pr:status <pr>...');
    const missing = await run(api.url, ['44']);
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain('GitHub answered 404');
  });
});
