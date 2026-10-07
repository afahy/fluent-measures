// Files a record when Codex or CodeRabbit posts a finding on a pull request that has already
// merged or closed, because no agent watches a closed PR (AFA-101). Used by
// .github/workflows/late-bot-findings.yml.
//
// It reads the event from GITHUB_EVENT_PATH. With LINEAR_API_KEY set, it files a Linear issue
// in LINEAR_PROJECT_ID's project for LINEAR_TEAM_ID. Without it, it opens a GitHub issue
// labeled `late-bot-finding`, using GITHUB_TOKEN. A later finding on the same PR becomes a
// comment on that record. Comment text is only ever data here: it's quoted into the record,
// never run.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const BOTS = new Set(['chatgpt-codex-connector[bot]', 'coderabbitai[bot]']);
export const LABEL = 'late-bot-finding';

/** Bot comments that hold no finding: summaries, notes, replies to requests, clean reviews. */
const ROUTINE =
  /codex-pull-request-review-summary|summarize by coderabbit|rate limited by coderabbit|auto-generated reply by coderabbit|didn't find any major issues/i;

/** Sections of a CodeRabbit review body that hold findings outside its review threads. */
const BODY_FINDINGS = /(outside diff range|nitpick) comments \((\d+)\)/gi;

/**
 * @typedef {{ pr: number, title: string, prUrl: string, closed: string, author: string,
 *   url: string, summary: string, excerpt: string }} Finding
 */

/**
 * The PR and comment in a pull_request_review, pull_request_review_comment or issue_comment
 * event, or null for an event this script doesn't handle.
 *
 * @param {string} name The event name, as in GITHUB_EVENT_NAME.
 * @param {any} event The event payload.
 */
function parts(name, event) {
  if (name === 'issue_comment') {
    if (!event.issue?.pull_request) return null;
    return { pull: event.issue, item: event.comment, kind: 'comment' };
  }
  if (name === 'pull_request_review_comment') {
    return { pull: event.pull_request, item: event.comment, kind: 'thread' };
  }
  if (name === 'pull_request_review') {
    return { pull: event.pull_request, item: event.review, kind: 'review' };
  }
  return null;
}

/**
 * The finding in an event, or null if the event isn't a Codex or CodeRabbit finding on a
 * closed PR.
 *
 * @param {string} name
 * @param {any} event
 * @returns {Finding | null}
 */
export function lateFinding(name, event) {
  const found = parts(name, event);
  if (!found || !found.item) return null;
  const { pull, item, kind } = found;
  if (pull.state !== 'closed') return null;
  const author = item.user?.login ?? '';
  if (!BOTS.has(author)) return null;
  const body = item.body ?? '';
  /** @type {string} */
  let summary;
  if (kind === 'thread') {
    // A bot's reply in a thread answers a person who is already in that thread.
    if (item.in_reply_to_id) return null;
    summary = `a review comment on \`${item.path}\``;
  } else if (kind === 'review') {
    // The findings in a review's threads arrive as their own events. Only CodeRabbit puts
    // findings in the review body.
    const sections = [...body.matchAll(BODY_FINDINGS)].map(m => `${m[2]} ${m[1].toLowerCase()}`);
    if (sections.length === 0) return null;
    summary = `a review with ${sections.join(' and ')} comments`;
  } else {
    if (ROUTINE.test(body)) return null;
    summary = 'a comment';
  }
  const merged = Boolean(pull.merged_at || pull.pull_request?.merged_at);
  return {
    pr: pull.number,
    title: pull.title,
    prUrl: pull.html_url,
    closed: merged ? 'merged' : 'closed',
    author,
    url: item.html_url,
    summary,
    excerpt: excerpt(body),
  };
}

/**
 * The first part of a bot's comment as a Markdown quote, without HTML comments and details
 * blocks.
 *
 * @param {string} body
 * @returns {string}
 */
export function excerpt(body) {
  const text = body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<details>[\s\S]*?<\/details>/gi, '')
    // A removed block leaves blank lines on both sides.
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const short = text.length > 600 ? `${text.slice(0, 600).trimEnd()}…` : text;
  return short
    .split('\n')
    .map(line => `> ${line}`.trimEnd())
    .join('\n');
}

/**
 * The record's title, which is also how a later finding on the same PR finds it.
 *
 * @param {Finding} finding
 * @returns {string}
 */
export function recordTitle(finding) {
  return `Bot findings after #${finding.pr} ${finding.closed}`;
}

/**
 * @param {Finding} finding
 * @returns {string}
 */
export function recordEntry(finding) {
  return [
    `${finding.author} left ${finding.summary} on [#${finding.pr}](${finding.prUrl}) after it ${finding.closed}: ${finding.url}`,
    '',
    finding.excerpt,
  ].join('\n');
}

/**
 * @param {Finding} finding
 * @returns {string}
 */
export function recordBody(finding) {
  return [
    `Codex or CodeRabbit posted findings on [#${finding.pr}](${finding.prUrl}) (${finding.title}) after it ${finding.closed}, so no agent was watching. Judge each one as AGENTS.md "Handle findings and CI" says.`,
    '',
    recordEntry(finding),
  ].join('\n');
}

/**
 * @param {typeof fetch} get
 * @param {string} url
 * @param {RequestInit & { headers: Record<string, string> }} init
 */
async function call(get, url, init) {
  const response = await get(url, init);
  if (!response.ok) {
    throw new Error(
      `${init.method ?? 'GET'} ${url} answered ${response.status}: ${(await response.text()).slice(0, 200)}`
    );
  }
  return response.json();
}

/**
 * Adds the finding to an open GitHub issue for the PR, or opens one.
 *
 * @param {Finding} finding
 * @param {{ repo: string, token: string, apiUrl?: string, fetch?: typeof fetch }} options
 * @returns {Promise<string>} The issue's URL.
 */
export async function fileOnGitHub(
  finding,
  { repo, token, apiUrl = 'https://api.github.com', fetch: get = fetch }
) {
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
  const title = recordTitle(finding);
  const open = await call(
    get,
    `${apiUrl}/repos/${repo}/issues?labels=${LABEL}&state=open&per_page=100`,
    { headers }
  );
  const issue = open.find((/** @type {{ title: string }} */ i) => i.title === title);
  if (issue) {
    await call(get, `${apiUrl}/repos/${repo}/issues/${issue.number}/comments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ body: recordEntry(finding) }),
    });
    return issue.html_url;
  }
  // Create the label the first time. 422 means it exists already.
  const label = await get(`${apiUrl}/repos/${repo}/labels`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: LABEL,
      color: 'f9d0c4',
      description: 'Codex or CodeRabbit posted findings after the PR closed',
    }),
  });
  if (!label.ok && label.status !== 422) {
    throw new Error(`POST ${apiUrl}/repos/${repo}/labels answered ${label.status}`);
  }
  const created = await call(get, `${apiUrl}/repos/${repo}/issues`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ title, body: recordBody(finding), labels: [LABEL] }),
  });
  return created.html_url;
}

/**
 * Adds the finding to the Linear issue for the PR, or files one.
 *
 * @param {Finding} finding
 * @param {{ apiKey: string, teamId: string, projectId: string, fetch?: typeof fetch }} options
 * @returns {Promise<string>} The issue's URL.
 */
export async function fileOnLinear(finding, { apiKey, teamId, projectId, fetch: get = fetch }) {
  /**
   * @param {string} query
   * @param {Record<string, unknown>} variables
   */
  const graphql = async (query, variables) => {
    const result = await call(get, 'https://api.linear.app/graphql', {
      method: 'POST',
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (result.errors?.length) throw new Error(`Linear: ${result.errors[0].message}`);
    return result.data;
  };
  const title = recordTitle(finding);
  const found = await graphql(
    `
      query Find($title: String!, $projectId: ID!) {
        issues(filter: { title: { eq: $title }, project: { id: { eq: $projectId } } }, first: 1) {
          nodes {
            id
            url
          }
        }
      }
    `,
    { title, projectId }
  );
  const issue = found.issues.nodes[0];
  if (issue) {
    await graphql(
      'mutation Comment($input: CommentCreateInput!) { commentCreate(input: $input) { success } }',
      { input: { issueId: issue.id, body: recordEntry(finding) } }
    );
    return issue.url;
  }
  const created = await graphql(
    'mutation Create($input: IssueCreateInput!) { issueCreate(input: $input) { issue { url } } }',
    { input: { teamId, projectId, title, description: recordBody(finding) } }
  );
  return created.issueCreate.issue.url;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH ?? '', 'utf8'));
  const finding = lateFinding(process.env.GITHUB_EVENT_NAME ?? '', event);
  if (!finding) {
    console.log('No finding from Codex or CodeRabbit on a closed PR.');
    process.exit(0);
  }
  const { LINEAR_API_KEY, LINEAR_TEAM_ID, LINEAR_PROJECT_ID, GITHUB_TOKEN, GITHUB_REPOSITORY } =
    process.env;
  const url = LINEAR_API_KEY
    ? await fileOnLinear(finding, {
        apiKey: LINEAR_API_KEY,
        teamId: LINEAR_TEAM_ID ?? '',
        projectId: LINEAR_PROJECT_ID ?? '',
      })
    : await fileOnGitHub(finding, { repo: GITHUB_REPOSITORY ?? '', token: GITHUB_TOKEN ?? '' });
  console.log(`Filed ${finding.author}'s finding on #${finding.pr} in ${url}`);
}
