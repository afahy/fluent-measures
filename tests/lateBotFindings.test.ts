import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  excerpt,
  fileOnGitHub,
  fileOnLinear,
  lateFinding,
  recordBody,
  recordEntry,
  recordTitle,
  type Finding,
} from '../.github/scripts/late-bot-findings.mjs';

// Real Codex and CodeRabbit comments and reviews from PRs in this repo (#22, #43, #57, #67).
const bot = JSON.parse(readFileSync('tests/fixtures/late-bot-findings/comments.json', 'utf8'));

const merged43 = {
  number: 43,
  title: 'fix: read the number after any unit label, not only in and m',
  html_url: 'https://github.com/afahy/fluent-measures/pull/43',
  state: 'closed',
  merged_at: '2026-10-05T20:05:22Z',
};
// An issue_comment event describes the PR as an issue.
const mergedIssue43 = {
  number: 43,
  title: merged43.title,
  html_url: merged43.html_url,
  state: 'closed',
  pull_request: { merged_at: '2026-10-05T20:05:22Z' },
};

describe('lateFinding', () => {
  it('reports a Codex review comment that starts a thread on a merged PR', () => {
    const finding = lateFinding('pull_request_review_comment', {
      pull_request: merged43,
      comment: bot.codexThreadComment,
    });
    expect(finding).toEqual({
      pr: 43,
      title: merged43.title,
      prUrl: merged43.html_url,
      closed: 'merged',
      author: 'chatgpt-codex-connector[bot]',
      url: 'https://github.com/afahy/fluent-measures/pull/43#discussion_r4187006557',
      summary: 'a review comment on `src/parseMeasurement.ts`',
      excerpt: expect.stringContaining('Reject unsupported units after a labeled value'),
    });
  });

  it('reports a CodeRabbit review whose body holds nitpicks, and says closed for a closed PR', () => {
    const finding = lateFinding('pull_request_review', {
      pull_request: { ...merged43, merged_at: null },
      review: bot.coderabbitNitpickReview,
    });
    expect(finding).toMatchObject({
      closed: 'closed',
      author: 'coderabbitai[bot]',
      summary: 'a review with 1 nitpick comments',
      url: 'https://github.com/afahy/fluent-measures/pull/22#pullrequestreview-5299026439',
    });
  });

  it('names every section of findings in a review body', () => {
    const finding = lateFinding('pull_request_review', {
      pull_request: merged43,
      review: {
        ...bot.coderabbitReview,
        body: '⚠️ Outside diff range comments (2)\n…\n🧹 Nitpick comments (12)',
      },
    });
    expect(finding?.summary).toBe('a review with 2 outside diff range and 12 nitpick comments');
  });

  it('reports a bot comment on a merged PR that is not one of its routine notes', () => {
    const finding = lateFinding('issue_comment', {
      issue: mergedIssue43,
      comment: { ...bot.codexNoFindings, body: 'Codex Review: one finding, see below.' },
    });
    expect(finding).toMatchObject({ closed: 'merged', summary: 'a comment' });
  });

  it.each([
    ['a summary', 'coderabbitSummary'],
    ["Codex's summary", 'codexSummary'],
    ['a reply to a review request', 'coderabbitRefusal'],
    ['a rate-limit note', 'coderabbitRateLimitNote'],
    ["Codex's no-findings comment", 'codexNoFindings'],
  ])('skips %s', (_, name) => {
    expect(lateFinding('issue_comment', { issue: mergedIssue43, comment: bot[name] })).toBeNull();
  });

  it("skips a bot's reply in a thread, and reviews whose findings are all in threads", () => {
    expect(
      lateFinding('pull_request_review_comment', {
        pull_request: merged43,
        comment: bot.coderabbitThreadReply,
      })
    ).toBeNull();
    for (const review of [bot.coderabbitReview, bot.codexReview]) {
      expect(lateFinding('pull_request_review', { pull_request: merged43, review })).toBeNull();
    }
  });

  it('skips open PRs, people, issues that are not PRs, and other events', () => {
    const open = { ...merged43, state: 'open', merged_at: null };
    expect(
      lateFinding('pull_request_review_comment', {
        pull_request: open,
        comment: bot.codexThreadComment,
      })
    ).toBeNull();
    const person = { ...bot.codexThreadComment, user: { login: 'afahy', type: 'User' } };
    expect(
      lateFinding('pull_request_review_comment', { pull_request: merged43, comment: person })
    ).toBeNull();
    const issue = { ...mergedIssue43, pull_request: undefined };
    expect(
      lateFinding('issue_comment', {
        issue,
        comment: { ...bot.codexNoFindings, body: 'A finding' },
      })
    ).toBeNull();
    expect(
      lateFinding('push', { pull_request: merged43, comment: bot.codexThreadComment })
    ).toBeNull();
    expect(lateFinding('pull_request_review', { pull_request: merged43 })).toBeNull();
  });
});

describe('excerpt', () => {
  it('drops HTML comments and details blocks and quotes the rest', () => {
    const body =
      '<!-- marker -->\n**Fix the label**\n\n<details>\n<summary>More</summary>\nhidden\n</details>\nLast line';
    expect(excerpt(body)).toBe('> **Fix the label**\n>\n> Last line');
  });

  it('cuts a long comment at 600 characters', () => {
    expect(excerpt(`${'a'.repeat(599)} b c`)).toBe(`> ${'a'.repeat(599)}…`);
  });
});

describe('records', () => {
  const finding: Finding = {
    pr: 43,
    title: 'fix: a title',
    prUrl: 'https://github.com/afahy/fluent-measures/pull/43',
    closed: 'merged',
    author: 'coderabbitai[bot]',
    url: 'https://github.com/afahy/fluent-measures/pull/43#discussion_r1',
    summary: 'a review comment on `README.md`',
    excerpt: '> Check this.',
  };

  it('titles a record by PR and describes each finding with its link and quote', () => {
    expect(recordTitle(finding)).toBe('Bot findings after #43 merged');
    expect(recordEntry(finding)).toBe(
      'coderabbitai[bot] left a review comment on `README.md` on [#43](https://github.com/afahy/fluent-measures/pull/43) after it merged: https://github.com/afahy/fluent-measures/pull/43#discussion_r1\n\n> Check this.'
    );
    expect(recordBody(finding)).toBe(
      'Codex or CodeRabbit posted findings on [#43](https://github.com/afahy/fluent-measures/pull/43) (fix: a title) after it merged, so no agent was watching. Judge each one as AGENTS.md "Handle findings and CI" says.\n\n' +
        recordEntry(finding)
    );
  });

  type Call = {
    url: string;
    init: { method?: string; headers: Record<string, string>; body?: string };
  };

  function fakeFetch(answers: unknown[]): { calls: Call[]; fetch: typeof globalThis.fetch } {
    const calls: Call[] = [];
    const fetch = async (url: string, init: Call['init']): Promise<Response> => {
      calls.push({ url, init });
      const answer = answers.shift();
      return answer instanceof Response
        ? answer
        : new Response(JSON.stringify(answer), { status: 200 });
    };
    return { calls, fetch: fetch as unknown as typeof globalThis.fetch };
  }

  it("opens a labeled GitHub issue when the PR has none, and comments on the PR's open one", async () => {
    const created = fakeFetch([
      [{ number: 7, title: 'Bot findings after #42 merged', html_url: 'x' }],
      new Response('{"message":"Validation Failed"}', { status: 422 }),
      { html_url: 'https://github.com/o/r/issues/8' },
    ]);
    await expect(
      fileOnGitHub(finding, {
        repo: 'o/r',
        token: 't',
        apiUrl: 'https://api.test',
        fetch: created.fetch,
      })
    ).resolves.toBe('https://github.com/o/r/issues/8');
    expect(created.calls.map(c => `${c.init.method ?? 'GET'} ${c.url}`)).toEqual([
      'GET https://api.test/repos/o/r/issues?labels=late-bot-finding&state=open&per_page=100',
      'POST https://api.test/repos/o/r/labels',
      'POST https://api.test/repos/o/r/issues',
    ]);
    expect(created.calls[0].init.headers.Authorization).toBe('Bearer t');
    expect(JSON.parse(created.calls[1].init.body ?? '')).toMatchObject({
      name: 'late-bot-finding',
    });
    expect(JSON.parse(created.calls[2].init.body ?? '')).toEqual({
      title: 'Bot findings after #43 merged',
      body: recordBody(finding),
      labels: ['late-bot-finding'],
    });

    const commented = fakeFetch([
      [
        {
          number: 9,
          title: 'Bot findings after #43 merged',
          html_url: 'https://github.com/o/r/issues/9',
        },
      ],
      {},
    ]);
    await expect(
      fileOnGitHub(finding, {
        repo: 'o/r',
        token: 't',
        apiUrl: 'https://api.test',
        fetch: commented.fetch,
      })
    ).resolves.toBe('https://github.com/o/r/issues/9');
    expect(commented.calls[1].url).toBe('https://api.test/repos/o/r/issues/9/comments');
    expect(JSON.parse(commented.calls[1].init.body ?? '')).toEqual({ body: recordEntry(finding) });
  });

  it('fails when GitHub refuses to create the label', async () => {
    const { fetch } = fakeFetch([[], new Response('Forbidden', { status: 403 })]);
    await expect(
      fileOnGitHub(finding, { repo: 'o/r', token: 't', apiUrl: 'https://api.test', fetch })
    ).rejects.toThrow('POST https://api.test/repos/o/r/labels answered 403');
  });

  it('fails with the status when GitHub refuses', async () => {
    const { fetch } = fakeFetch([new Response('Forbidden', { status: 403 })]);
    await expect(
      fileOnGitHub(finding, { repo: 'o/r', token: 't', apiUrl: 'https://api.test', fetch })
    ).rejects.toThrow(
      'GET https://api.test/repos/o/r/issues?labels=late-bot-finding&state=open&per_page=100 answered 403: Forbidden'
    );
  });

  it("files a Linear issue in the project when the PR has none, and comments on the PR's one", async () => {
    const created = fakeFetch([
      { data: { issues: { nodes: [] } } },
      { data: { issueCreate: { issue: { url: 'https://linear.app/i/1' } } } },
    ]);
    await expect(
      fileOnLinear(finding, {
        apiKey: 'k',
        teamId: 'team',
        projectId: 'project',
        fetch: created.fetch,
      })
    ).resolves.toBe('https://linear.app/i/1');
    expect(created.calls[0].init.headers.Authorization).toBe('k');
    expect(JSON.parse(created.calls[0].init.body ?? '').variables).toEqual({
      title: 'Bot findings after #43 merged',
      projectId: 'project',
    });
    expect(JSON.parse(created.calls[1].init.body ?? '').variables).toEqual({
      input: {
        teamId: 'team',
        projectId: 'project',
        title: 'Bot findings after #43 merged',
        description: recordBody(finding),
      },
    });

    const commented = fakeFetch([
      { data: { issues: { nodes: [{ id: 'abc', url: 'https://linear.app/i/2' }] } } },
      { data: { commentCreate: { success: true } } },
    ]);
    await expect(
      fileOnLinear(finding, {
        apiKey: 'k',
        teamId: 'team',
        projectId: 'project',
        fetch: commented.fetch,
      })
    ).resolves.toBe('https://linear.app/i/2');
    expect(JSON.parse(commented.calls[1].init.body ?? '').variables).toEqual({
      input: { issueId: 'abc', body: recordEntry(finding) },
    });
  });

  it("fails with Linear's error message", async () => {
    const { fetch } = fakeFetch([{ errors: [{ message: 'Authentication required' }] }]);
    await expect(
      fileOnLinear(finding, { apiKey: 'k', teamId: 't', projectId: 'p', fetch })
    ).rejects.toThrow('Linear: Authentication required');
  });
});
