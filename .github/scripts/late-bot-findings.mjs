// Files a record when Codex or CodeRabbit posts a finding on a pull request that has already
// merged or closed, because no agent watches a closed PR (AFA-101). Used by
// .github/workflows/late-bot-findings.yml.
//
// It reads the event from GITHUB_EVENT_PATH. With LINEAR_API_KEY set, it files a Linear issue
// in LINEAR_PROJECT_ID's project for LINEAR_TEAM_ID. Without it, it opens a GitHub issue
// labeled `late-bot-finding`, using GITHUB_TOKEN. A later finding on the same PR becomes a
// comment on that record. Comment text is only ever data here: it's quoted into the record,
// never run.
//
// One review can send several events at once, one for each of its comments, and each run
// files the finding in its own job. Two runs that find no record can both open one, so after
// opening a record, a run looks again, and if an older record for the PR exists, it moves its
// finding there and removes its own.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const BOTS = new Set(['chatgpt-codex-connector[bot]', 'coderabbitai[bot]']);
export const LABEL = 'late-bot-finding';

/**
 * Bot comments that hold no finding, by how they start: CodeRabbit's summaries, rate-limit notes
 * and replies to requests, which open with a marker; Codex's summary; and Codex's notes that it
 * found nothing or ran out of reviews. A finding that only mentions these words still counts.
 */
const ROUTINE =
  /^\s*(?:<!-- (?:This is an auto-generated (?:comment: (?:summarize|rate limited) by coderabbit\.ai|reply by CodeRabbit)|codex-pull-request-review-summary) -->|Codex Review: Didn't find any major issues|You have reached your Codex usage limits)/i;

/** Codex's reply when it finishes a task that someone asked it for: a summary and a link. */
const CODEX_TASK = /^\s*### Summary\b[\s\S]*\[View task →\]\(https:\/\/chatgpt\.com\/[^\s)]*\)\s*$/;

/** Sections of a CodeRabbit review body that hold findings outside its review threads. */
const BODY_FINDINGS = /(outside diff range|nitpick) comments \((\d+)\)/gi;

/** How much of a bot's text a record quotes. */
const EXCERPT_LENGTH = 600;

const HTML_COMMENT = /<!--[\s\S]*?-->/g;
/**
 * A tag that the bots write, in lower case, with attributes in HTML form. Text such as
 * `Promise<string>`, `f<T>(a: Array<T>)` or the placeholder `<sha>` isn't a tag.
 */
const TAG =
  /<\/?(?:a|b|blockquote|br|code|details|em|hr|i|img|li|ol|p|pre|relative-time|strong|sub|summary|sup|table|tbody|td|th|thead|tr|ul)(?:\s+[\w:.-]+(?:=(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*\s*\/?>/g;
/** Three or more line breaks with only spaces between them. The next line keeps its indent. */
const BLANK_LINES = /\n(?:[^\S\n]*\n){2,}/g;
/** A collapsed section with no section inside it. */
const INNERMOST_DETAILS = /<details\b[^>]*>(?:(?!<details\b)[\s\S])*?<\/details>/gi;

/** The columns that a line's leading spaces and tabs take, with a tab stop every 4 columns. */
function indentOf(line) {
  let columns = 0;
  for (const character of /^[ \t]*/.exec(line)?.[0] ?? '') {
    columns += character === '\t' ? 4 - (columns % 4) : 1;
  }
  return columns;
}

/** A list marker, such as `-` or `1.`, with the spaces after it. */
const LIST_MARKER = /^(?:[-+*]|\d{1,9}[.)])(?: {1,4}|$)/;

/**
 * The run of marks that opens a fence at the start of a line's text, or null. A backtick fence
 * has no backtick after its run.
 *
 * @param {string} words
 * @returns {string | null}
 */
function fenceRun(words) {
  const open = /^(`{3,}|~{3,})(.*)$/.exec(words);
  return open && !(open[1][0] === '`' && open[2].includes('`')) ? open[1] : null;
}

/**
 * The code blocks in Markdown text, read line by line as CommonMark reads them. A line break can
 * be `\n` or `\r\n`. A line can start with `>` marks, which put it in a quote, and with a list
 * marker, which starts a list item. Indents count from the text of the list item.
 * - A fence is three or more backticks or tildes, indented at most three columns. A line of at
 *   least as many of the same marks and nothing else closes it. A fence also ends with its quote
 *   or list item. A fence that is still open at the end of the text isn't code: a bot that
 *   doesn't close a fence more likely broke its Markdown than put the rest of its comment in code.
 *   Its opening line is in `marks`, so its backticks open no code span.
 * - A line indented four columns starts an indented block, but not right after a paragraph line.
 *   The block ends before the next line that has text and a smaller indent.
 *
 * @param {string} text
 * @returns {{ ranges: { start: number, end: number, inline: boolean, marks: number }[],
 *   marks: { start: number, end: number }[] }}
 */
function codeBlocks(text) {
  /** @type {{ start: number, end: number, inline: boolean, marks: number }[]} */
  const ranges = [];
  /** @type {{ start: number, end: number, mark: string, length: number, quote: RegExp, list: number } | null} */
  let fence = null;
  let block = -1;
  let blockEnd = 0;
  /** The columns where the text of each open list item starts, the innermost last. */
  const lists = [];
  let depth = 0;
  // Whether the line before ends no paragraph: a blank line, the start of the text or of a quote,
  // or the end of a fence.
  let blank = true;
  let start = 0;
  for (const raw of text.split('\n')) {
    const end = start + raw.length;
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (fence) {
      // In a fence, only the fence's own quote marks are marks. A line without them ends the quote.
      const quote = fence.quote.exec(line);
      if (quote) {
        const rest = line.slice(quote[0].length);
        const indent = indentOf(rest);
        const close = /^(`+|~+) *$/.exec(rest.trimStart());
        if (
          close &&
          close[1][0] === fence.mark &&
          close[1].length >= fence.length &&
          indent <= fence.list + 3
        ) {
          ranges.push({ start: fence.start, end, inline: false, marks: 0 });
          fence = null;
          blank = true;
          start = end + 1;
          continue;
        }
        if (rest.trim() === '' || indent >= fence.list) {
          start = end + 1;
          continue;
        }
      }
      // The quote or the list item ended, and the fence with it.
      ranges.push({ start: fence.start, end: start - 1, inline: false, marks: 0 });
      fence = null;
      blank = true;
    }
    const quote = /^(?: {0,3}> ?)*/.exec(line)?.[0] ?? '';
    const lineDepth = quote.split('>').length - 1;
    const rest = line.slice(quote.length);
    const empty = rest.trim() === '';
    const indent = indentOf(rest);
    const content = rest.trimStart();
    if (lineDepth !== depth) {
      // A quote starts a new container. A line after a quote, without its marks, can go on with
      // the quote's paragraph.
      if (block !== -1) ranges.push({ start: block, end: blockEnd, inline: false, marks: 0 });
      block = -1;
      lists.length = 0;
      if (lineDepth > depth) blank = true;
      depth = lineDepth;
    }
    if (empty) {
      blank = true;
      start = end + 1;
      continue;
    }
    // A line with a smaller indent ends the list items that it isn't in, unless it goes on with
    // their paragraph.
    if (indent < (lists.at(-1) ?? 0) && (blank || fenceRun(content) || LIST_MARKER.test(content))) {
      while (lists.length && indent < (lists.at(-1) ?? 0)) lists.pop();
    }
    const list = lists.at(-1) ?? 0;
    if (indent >= list + 4 && (blank || block !== -1)) {
      if (block === -1) block = start;
      blockEnd = end;
      start = end + 1;
      continue;
    }
    if (block !== -1) ranges.push({ start: block, end: blockEnd, inline: false, marks: 0 });
    block = -1;
    if (indent < list + 4) {
      let words = content;
      const item = LIST_MARKER.exec(content);
      if (item) {
        lists.push(indent + item[0].length);
        words = content.slice(item[0].length);
      }
      const run = fenceRun(words);
      if (run) {
        fence = {
          start,
          end,
          mark: run[0],
          length: run.length,
          quote: new RegExp(`^(?: {0,3}> ?){${lineDepth}}`),
          list: lists.at(-1) ?? 0,
        };
      }
    }
    blank = false;
    start = end + 1;
  }
  if (block !== -1) ranges.push({ start: block, end: blockEnd, inline: false, marks: 0 });
  return { ranges, marks: fence ? [{ start: fence.start, end: fence.end }] : [] };
}

/**
 * The code in Markdown text: the code blocks that `codeBlocks` finds, and the code spans outside
 * them. Each range runs from `start` to `end`, with its marks, and `inline` is true for a code
 * span, whose run of backticks is `marks` long. A span starts at a run of backticks and ends at
 * the next run of the same length. An odd number of backslashes before a backtick makes it plain
 * text. A span ends at a blank line, so a stray backtick can't hide a collapsed section.
 *
 * @param {string} text
 * @returns {{ start: number, end: number, inline: boolean, marks: number }[]}
 */
function codeRanges(text) {
  const { ranges, marks } = codeBlocks(text);
  const blocks = mask(text, [...ranges, ...marks]);
  let at = blocks.indexOf('`');
  while (at !== -1) {
    let slashes = 0;
    while (blocks[at - 1 - slashes] === '\\') slashes += 1;
    if (slashes % 2 === 1) {
      at = blocks.indexOf('`', at + 1);
      continue;
    }
    let end = at;
    while (blocks[end] === '`') end += 1;
    const run = blocks.slice(at, end);
    let close = blocks.indexOf(run, end);
    // A run of a different length doesn't close the span.
    while (close !== -1 && (blocks[close - 1] === '`' || blocks[close + run.length] === '`')) {
      close = blocks.indexOf(run, close + 1);
    }
    if (close === -1 || /\n[^\S\n]*\n/.test(blocks.slice(end, close))) {
      at = blocks.indexOf('`', end);
      continue;
    }
    ranges.push({ start: at, end: close + run.length, inline: true, marks: run.length });
    at = blocks.indexOf('`', close + run.length);
  }
  return ranges;
}

/**
 * The text with each range blanked out. Line breaks stay, and the length doesn't change, so an
 * index is the same in both.
 *
 * @param {string} text
 * @param {{ start: number, end: number }[]} ranges
 * @returns {string}
 */
function mask(text, ranges) {
  let masked = text;
  for (const { start, end } of ranges) {
    masked =
      masked.slice(0, start) + masked.slice(start, end).replace(/[^\n]/g, ' ') + masked.slice(end);
  }
  return masked;
}

/**
 * The text with its code blanked out, as `mask` does.
 *
 * @param {string} text
 * @returns {string}
 */
function maskCode(text) {
  return mask(text, codeRanges(text));
}

/**
 * Removes each pattern's matches outside code again and again until none is left. One pass
 * isn't enough: removing `<!---->` from `<!<!---->-- x -->` leaves a new comment behind.
 *
 * @param {string} text
 * @param {RegExp[]} patterns Global patterns, removed in this order on each pass.
 * @returns {string}
 */
function removeAll(text, patterns) {
  let previous;
  do {
    previous = text;
    for (const pattern of patterns) {
      // Matches don't overlap, so removing the last one first keeps each index right.
      for (const match of [...maskCode(text).matchAll(pattern)].reverse()) {
        const start = match.index ?? 0;
        text = text.slice(0, start) + text.slice(start + match[0].length);
      }
    }
  } while (text !== previous);
  return text;
}

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
  let text = body;
  if (kind === 'thread') {
    // A bot's reply in a thread answers a person who is already in that thread.
    if (item.in_reply_to_id) return null;
    summary = `a review comment on \`${item.path}\``;
  } else if (kind === 'review') {
    // The findings in a review's threads arrive as their own events. Only CodeRabbit puts
    // findings in the review body, inside collapsed sections.
    const sections = findingSections(body);
    if (sections.titles.length === 0) return null;
    const names = sections.titles.map(
      m => `${m[2]} ${m[1].toLowerCase()} comment${m[2] === '1' ? '' : 's'}`
    );
    summary = `a review with ${names.join(' and ')}`;
    // Quote only the sections of findings, so the collapsed sections after them, such as the
    // review's settings, stay out. Drop the prompts for AI agents, which repeat the findings as
    // instructions. In a Markdown quote, a `>` starts each line between the tags. HTML comments
    // go first, so a prompt's tag in a comment can't pair with a real `</details>`.
    const prompts =
      /<details\b[^>]*>[\s>]*<summary>[^<]*prompt[^<]*<\/summary>(?:(?!<details\b)[\s\S])*?<\/details>/gi;
    text = plainText(removeAll(sections.text, [HTML_COMMENT, prompts]));
  } else {
    if (ROUTINE.test(body)) return null;
    if (author === 'chatgpt-codex-connector[bot]' && CODEX_TASK.test(body)) return null;
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
    excerpt: excerpt(text),
  };
}

/**
 * The sections of findings in a review body, outside code and HTML comments. A title in a
 * `<summary>` is collapsed, and its section runs to the `</details>` that closes it. Any other
 * title must start its line, after marks such as `**` and an emoji. Its section holds the
 * collapsed sections of files, such as `src/a.ts (1)`, and of prompts. It ends at the next title,
 * at another collapsed section, such as the review's settings, or at a `</details>` that closes
 * one around it. A title inside a section that is already quoted adds nothing, and a section
 * with no end runs to the end of the body.
 *
 * @param {string} body
 * @returns {{ titles: RegExpMatchArray[], text: string }}
 */
function findingSections(body) {
  const code = maskCode(body);
  const comments = [...code.matchAll(HTML_COMMENT)].map(({ index = 0, 0: comment }) => ({
    start: index,
    end: index + comment.length,
  }));
  const masked = mask(code, comments);
  const summaryTags = [...masked.matchAll(/<(\/?)summary\b[^>]*>/gi)];
  /** Whether the text at `index` is inside a `<summary>` element. */
  const inSummary = (/** @type {number} */ index) => {
    let open = false;
    for (const tag of summaryTags) {
      if ((tag.index ?? 0) >= index) break;
      open = !tag[1];
    }
    return open;
  };
  const all = [...masked.matchAll(BODY_FINDINGS)]
    .map(title => ({ title, collapsed: inSummary(title.index ?? 0) }))
    .filter(
      ({ title: { index = 0 }, collapsed }) =>
        collapsed ||
        /^[^\p{L}\p{N}]*$/u.test(masked.slice(masked.lastIndexOf('\n', index) + 1, index))
    );
  const titles = [];
  const parts = [];
  let end = 0;
  for (const [n, { title, collapsed }] of all.entries()) {
    const index = title.index ?? 0;
    if (index < end) continue;
    end = collapsed ? body.length : (all[n + 1]?.title.index ?? body.length);
    let depth = collapsed ? 1 : 0;
    const tags = /<(\/?)details\b[^>]*>(?:\s*<summary\b[^>]*>([^<]*)<\/summary>)?/gi;
    for (const tag of masked.slice(index, end).matchAll(tags)) {
      const inner =
        !collapsed &&
        depth === 0 &&
        !tag[1] &&
        /prompt|^[^\s<]+ \(\d+\)$/i.test(tag[2]?.trim() ?? '');
      if (depth === 0 && !collapsed && !inner) {
        end = index + (tag.index ?? 0);
        break;
      }
      depth += tag[1] ? -1 : 1;
      if (depth === 0 && collapsed) {
        end = index + (tag.index ?? 0);
        break;
      }
    }
    titles.push(title);
    parts.push(body.slice(index, end));
  }
  return { titles, text: parts.join('\n\n') };
}

/**
 * HTML reduced to its text: the tags that the bots write go, outside code, and so do the blank
 * lines that they leave.
 *
 * @param {string} html
 * @returns {string}
 */
export function plainText(html) {
  return removeAll(html, [HTML_COMMENT, TAG]).replace(BLANK_LINES, '\n\n').trim();
}

/**
 * The first part of a bot's comment as a Markdown quote, without HTML comments and collapsed
 * sections. Collapsed sections hold prompts for AI agents, analysis logs and settings, and they
 * can nest.
 *
 * @param {string} body
 * @returns {string}
 */
export function excerpt(body) {
  // Innermost sections go first, so a nested section goes with the one around it.
  const text = removeAll(body, [HTML_COMMENT, INNERMOST_DETAILS])
    .replace(BLANK_LINES, '\n\n')
    .trim();
  // Count characters, not UTF-16 units, so the cut doesn't split an emoji.
  const characters = Array.from(text);
  let short = text;
  if (characters.length > EXCERPT_LENGTH) {
    let cut = characters.slice(0, EXCERPT_LENGTH).join('').length;
    let close = '';
    // A cut inside a code span would leave the HTML in it live, so the span gets its closing
    // backticks. A cut in a span's opening backticks moves before the span. A cut fence or
    // indented block stays code to the end of the quote.
    for (const { start, end, inline, marks } of codeRanges(text)) {
      if (!inline || cut <= start || cut >= end) continue;
      if (cut <= start + marks) cut = start;
      else close = '`'.repeat(marks);
    }
    short = `${text.slice(0, cut).trimEnd()}${close}…`;
  }
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
 * @param {number[]} [allowed] Statuses besides 2xx that aren't errors.
 */
async function call(get, url, init, allowed = []) {
  const response = await get(url, init);
  if (!response.ok && !allowed.includes(response.status)) {
    throw new Error(
      `${init.method ?? 'GET'} ${url} answered ${response.status}: ${(await response.text()).slice(0, 200)}`
    );
  }
  return { response, data: response.ok ? await response.json() : null };
}

/**
 * Adds the finding to the open GitHub issue for the PR, or opens one.
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
  /**
   * @returns {Promise<{ id: number, number: number, html_url: string }[]>} The PR's open records,
   *   oldest first.
   */
  const records = async () => {
    /** @type {{ id: number, number: number, title: string, html_url: string }[]} */
    const issues = [];
    /** @type {string | null} */
    let url = `${apiUrl}/repos/${repo}/issues?labels=${LABEL}&state=open&per_page=100`;
    while (url) {
      const { response, data } = await call(get, url, { headers });
      issues.push(...data);
      url = /<([^>]+)>;\s*rel="next"/.exec(response.headers.get('link') ?? '')?.[1] ?? null;
    }
    return issues.filter(i => i.title === title).sort((a, b) => a.number - b.number);
  };
  /** @param {number} number */
  const comment = async number =>
    call(get, `${apiUrl}/repos/${repo}/issues/${number}/comments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ body: recordEntry(finding) }),
    });

  const [existing] = await records();
  if (existing) {
    await comment(existing.number);
    return existing.html_url;
  }
  // Create the label the first time. 422 means it exists already.
  await call(
    get,
    `${apiUrl}/repos/${repo}/labels`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: LABEL,
        color: 'f9d0c4',
        description: 'Codex or CodeRabbit posted findings after the PR closed',
      }),
    },
    [422]
  );
  const { data: created } = await call(get, `${apiUrl}/repos/${repo}/issues`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ title, body: recordBody(finding), labels: [LABEL] }),
  });
  // Another run may have opened a record for the same PR at the same time.
  const [oldest] = await records();
  if (oldest && oldest.number !== created.number) {
    await comment(oldest.number);
    await call(get, `${apiUrl}/repos/${repo}/issues/${created.number}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        state: 'closed',
        state_reason: 'duplicate',
        duplicate_issue_id: oldest.id,
      }),
    });
    return oldest.html_url;
  }
  return created.html_url;
}

/**
 * Adds the finding to the open Linear issue for the PR, or files one.
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
    const { data: result } = await call(get, 'https://api.linear.app/graphql', {
      method: 'POST',
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (result.errors?.length) throw new Error(`Linear: ${result.errors[0].message}`);
    // A mutation can fail without an error, with `success: false`.
    for (const [name, value] of Object.entries(result.data ?? {})) {
      if (value?.success === false) throw new Error(`Linear: ${name} did not succeed`);
    }
    return result.data;
  };
  const title = recordTitle(finding);
  /** @returns {Promise<{ id: string, url: string }[]>} The PR's open records, oldest first. */
  const records = async () => {
    const found = await graphql(
      `
        query Find($title: String!, $projectId: ID!) {
          issues(
            filter: {
              title: { eq: $title }
              project: { id: { eq: $projectId } }
              state: { type: { nin: ["completed", "canceled"] } }
            }
            orderBy: createdAt
            first: 50
          ) {
            nodes {
              id
              url
              createdAt
            }
          }
        }
      `,
      { title, projectId }
    );
    return [...found.issues.nodes].sort(
      (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)
    );
  };
  /** @param {string} issueId */
  const comment = async issueId =>
    graphql(
      'mutation Comment($input: CommentCreateInput!) { commentCreate(input: $input) { success } }',
      { input: { issueId, body: recordEntry(finding) } }
    );

  const [existing] = await records();
  if (existing) {
    await comment(existing.id);
    return existing.url;
  }
  const created = await graphql(
    'mutation Create($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id url } } }',
    { input: { teamId, projectId, title, description: recordBody(finding) } }
  );
  const issue = created.issueCreate.issue;
  // Another run may have filed a record for the same PR at the same time.
  const [oldest] = await records();
  if (oldest && oldest.id !== issue.id) {
    await comment(oldest.id);
    // Deleting moves the issue to Linear's trash, where it can be restored.
    await graphql('mutation Delete($id: String!) { issueDelete(id: $id) { success } }', {
      id: issue.id,
    });
    return oldest.url;
  }
  return issue.url;
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
