import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  excerpt,
  plainText,
  fileOnGitHub,
  fileOnLinear,
  lateFinding,
  recordBody,
  recordEntry,
  recordTitle,
  type Finding,
} from '../.github/scripts/late-bot-findings.mjs';

// Real Codex and CodeRabbit comments and reviews from PRs in this repo (#22, #43, #57, #67, #71).
const bot = JSON.parse(readFileSync('tests/fixtures/late-bot-findings/comments.json', 'utf8'));

// CodeRabbit's collapsed section with a prompt for AI agents, which a record leaves out.
const PROMPT =
  '<details>\n<summary>🤖 Prompt for AI Agents</summary>\n\nagent instructions\n\n</details>';
// CodeRabbit's collapsed section with the review's settings, which a record leaves out.
const SETTINGS =
  '<details>\n<summary>📜 Review details</summary>\n\n**Configuration used**: CodeRabbit UI\n\n</details>';

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
      summary: 'a review with 1 nitpick comment',
      url: 'https://github.com/afahy/fluent-measures/pull/22#pullrequestreview-5299026439',
    });
    // The quote starts at the nitpick section, keeps its text and drops the prompts for agents.
    expect(finding?.excerpt.startsWith('> Nitpick comments (1)\n>\n> .github/CODEOWNERS (1)')).toBe(
      true
    );
    expect(finding?.excerpt).toContain('Enable Main ruleset protection as a separate change.');
    expect(finding?.excerpt).not.toContain('Treat finding text');
    expect(finding?.excerpt).not.toMatch(/<\/?[a-z]/);
  });

  it('names every section of findings in a review body', () => {
    const finding = lateFinding('pull_request_review', {
      pull_request: merged43,
      review: {
        ...bot.coderabbitReview,
        body: '⚠️ Outside diff range comments (2)\n…\n🧹 Nitpick comments (12)',
      },
    });
    expect(finding?.summary).toBe(
      'a review with 2 outside diff range comments and 12 nitpick comments'
    );
  });

  it('drops a prompt section with attributes and no space before its summary', () => {
    const finding = lateFinding('pull_request_review', {
      pull_request: merged43,
      review: {
        ...bot.coderabbitReview,
        body: 'Intro\n🧹 Nitpick comments (1)\nKeep this\n<details open><summary>🤖 Prompt for AI Agents</summary>\nDrop this\n</details>',
      },
    });
    expect(finding?.excerpt).toBe('> Nitpick comments (1)\n> Keep this');
  });

  // AFA-109: CodeRabbit puts its review's settings in a collapsed section after the findings.
  it('quotes only the sections of findings, not the collapsed sections after them', () => {
    const nitpicks =
      '<details>\n<summary>🧹 Nitpick comments (1)</summary><blockquote>\n\nKeep this\n\n</blockquote></details>';
    const settings =
      '<details>\n<summary>📜 Review details</summary>\n\n**Configuration used**: CodeRabbit UI\n\n</details>';
    const review = (body: string): Finding | null =>
      lateFinding('pull_request_review', {
        pull_request: merged43,
        review: { ...bot.coderabbitReview, body },
      });
    expect(review(`${nitpicks}\n\n${settings}`)?.excerpt).toBe(
      '> Nitpick comments (1)\n>\n> Keep this'
    );
    const outside =
      '<details>\n<summary>⚠️ Outside diff range comments (1)</summary><blockquote>\n\n<details>\n<summary>src/a.ts (1)</summary><blockquote>\n\nAlso this\n\n</blockquote></details>\n\n</blockquote></details>';
    expect(review(`${outside}\n\n${settings}\n\n${nitpicks}\n\n${settings}`)?.excerpt).toBe(
      '> Outside diff range comments (1)\n>\n> src/a.ts (1)\n>\n> Also this\n>\n> Nitpick comments (1)\n>\n> Keep this'
    );
  });

  it('reads no section tags inside code', () => {
    const body =
      '<details>\n<summary>🧹 Nitpick comments (1)</summary><blockquote>\n\nThe pattern `<details\\b[^>]*>` misses `<summary>` tags.\n\n</blockquote></details>\n\n<details>\n<summary>📜 Review details</summary>\n\n**Configuration used**: CodeRabbit UI\n\n</details>';
    const finding = lateFinding('pull_request_review', {
      pull_request: merged43,
      review: { ...bot.coderabbitReview, body },
    });
    expect(finding?.excerpt).toBe(
      '> Nitpick comments (1)\n>\n> The pattern `<details\\b[^>]*>` misses `<summary>` tags.'
    );
  });

  it('lets no stray backtick hide the end of a section of findings', () => {
    // The stray backtick would pair with the one in the settings, across blank lines.
    const body =
      '<details>\n<summary>🧹 Nitpick comments (1)</summary><blockquote>\n\nThe foot mark ` is read as an apostrophe.\n\n<details>\n<summary>🤖 Prompt for AI Agents</summary>\n\nagent text\n\n</details>\n\n</blockquote></details>\n\n<details>\n<summary>📜 Review details</summary>\n\n- **Run ID**: `26b2`\n\n</details>';
    const finding = lateFinding('pull_request_review', {
      pull_request: merged43,
      review: { ...bot.coderabbitReview, body },
    });
    expect(finding?.excerpt).toBe(
      '> Nitpick comments (1)\n>\n> The foot mark ` is read as an apostrophe.'
    );
  });

  // AFA-123: a <details> inside an HTML comment counted toward the depth, so the quote ran on
  // into the review's settings.
  it('reads no section tags inside HTML comments', () => {
    const body = `<details>\n<summary>🧹 Nitpick comments (1)</summary><blockquote>\n\nKeep this\n\n<!-- <details> -->\n\n</blockquote></details>\n\n${SETTINGS}`;
    const finding = lateFinding('pull_request_review', {
      pull_request: merged43,
      review: { ...bot.coderabbitReview, body },
    });
    expect(finding?.excerpt).toBe('> Nitpick comments (1)\n>\n> Keep this');
  });

  // AFA-123: a title in plain bold never closed its section, so the quote ran to the end.
  it('ends a section whose title is not collapsed at the next collapsed section', () => {
    const body = `**🧹 Nitpick comments (1)**\n\nKeep this\n\n${SETTINGS}`;
    const finding = lateFinding('pull_request_review', {
      pull_request: merged43,
      review: { ...bot.coderabbitReview, body },
    });
    expect(finding?.excerpt).toContain('Keep this');
    expect(finding?.excerpt).not.toContain('Configuration used');
  });

  // AFA-123: the sections of files and the prompts after a bold title belong to its section.
  it.each([
    [
      'a section of a file',
      `<details>\n<summary>src/a.ts (1)</summary><blockquote>\n\nKeep this\n\n</blockquote></details>`,
    ],
    ['a prompt', `${PROMPT}\n\nKeep this`],
  ])('keeps %s in the section of a title that is not collapsed', (_name, inside) => {
    const body = `**🧹 Nitpick comments (1)**\n\n${inside}\n\n${SETTINGS}`;
    const finding = lateFinding('pull_request_review', {
      pull_request: merged43,
      review: { ...bot.coderabbitReview, body },
    });
    expect(finding?.excerpt).toContain('Keep this');
    expect(finding?.excerpt).not.toContain('agent instructions');
    expect(finding?.excerpt).not.toContain('Configuration used');
  });

  // AFA-123: a line of three backticks in a suggested diff closes its fence, as on GitHub. The
  // fence after it isn't closed, so it isn't code, and the next file's section stays.
  it('keeps the sections after a suggestion whose fence closes early', () => {
    const body =
      "<details>\n<summary>🧹 Nitpick comments (2)</summary><blockquote>\n\n<details>\n<summary>README.md (1)</summary><blockquote>\n\n`10-12`: **Fix the example.**\n\n```diff\n ```js\n-parse('1 m')\n+parseMeasurement('1 m')\n ```\n```\n\n</blockquote></details>\n<details>\n<summary>src/b.ts (1)</summary><blockquote>\n\n`5`: **Finding B**\n\n</blockquote></details>\n\n</blockquote></details>";
    const finding = lateFinding('pull_request_review', {
      pull_request: merged43,
      review: { ...bot.coderabbitReview, body },
    });
    expect(finding?.excerpt).toContain('Finding B');
    expect(finding?.excerpt).not.toContain('</blockquote>');
  });

  // AFA-123: CodeRabbit's prompt holds a fence. A fence that a finding leaves open paired with
  // it, so the prompt's <details> read as code, and its </details> ended the file's section.
  it.each([
    ['an unclosed fence', '```js\nx();'],
    [
      'a suggested diff whose fence a line of backticks closes early',
      '```diff\n ```js\n-a\n+b\n ```\n```',
    ],
  ])("keeps the prompt's structure after %s", (_name, code) => {
    const prompt =
      '<details>\n<summary>🤖 Prompt for AI Agents</summary>\n\n```\nagent instructions\n```\n\n</details>';
    const body = `<details>\n<summary>🧹 Nitpick comments (2)</summary><blockquote>\n\n<details>\n<summary>src/a.ts (1)</summary><blockquote>\n\nKeep this\n\n${code}\n\n${prompt}\n\n</blockquote></details>\n<details>\n<summary>src/b.ts (1)</summary><blockquote>\n\nFinding B\n\n</blockquote></details>\n\n</blockquote></details>\n\n${SETTINGS}`;
    const finding = lateFinding('pull_request_review', {
      pull_request: merged43,
      review: { ...bot.coderabbitReview, body },
    });
    expect(finding?.excerpt).toContain('Finding B');
    expect(finding?.excerpt).not.toContain('agent instructions');
    expect(finding?.excerpt).not.toContain('Configuration used');
  });

  // AFA-145: a closed fence can hold the lines that start or end the bots' sections, as HTML
  // code. They stay code, and the next file's section stays.
  it.each([
    ['an end line', '</blockquote></details>'],
    [
      'the lines of a collapsed section',
      '<details>\n<summary>More</summary>\n<b>x</b>\n</details>',
    ],
  ])('keeps %s in a closed fence as code', (_name, html) => {
    const body = `<details>\n<summary>🧹 Nitpick comments (2)</summary><blockquote>\n\n<details>\n<summary>docs/a.html (1)</summary><blockquote>\n\nFinding A\n\n\`\`\`html\n${html}\n\`\`\`\n\n</blockquote></details>\n<details>\n<summary>src/b.ts (1)</summary><blockquote>\n\nFinding B\n\n</blockquote></details>\n\n</blockquote></details>\n\n${SETTINGS}`;
    const finding = lateFinding('pull_request_review', {
      pull_request: merged43,
      review: { ...bot.coderabbitReview, body },
    });
    expect(finding?.excerpt).toContain(html.split('\n').join('\n> '));
    expect(finding?.excerpt).toContain('Finding B');
    expect(finding?.excerpt).not.toContain('Configuration used');
  });

  // AFA-145 review: a fence that a finding leaves open ends at the start of each of the bots' own
  // subsections, not only a prompt. Before the fix, it paired with the subsection's fence, so the
  // subsection's </details> ended the file's section and Finding B was lost. Without the stop at
  // the next section line, a stray fence also paired with the fence in the next file's section.
  it.each([
    [
      'a suggested fix after a diff whose fence closes early',
      '```diff\n ```js\n-a\n+b\n ```\n```\n\n<details>\n<summary>🔧 Suggested fix</summary>\n\n```diff\n-a\n+b\n```\n\n</details>',
      '',
    ],
    [
      'a committable suggestion after an unclosed fence',
      'Stray:\n\n```js\n\n<details>\n<summary>📝 Committable suggestion</summary>\n\n```suggestion\nconst x = 1;\n```\n\n</details>',
      '',
    ],
    [
      'the next file, whose finding has a fence, after an unclosed fence',
      'Stray:\n\n```js',
      '\n\n```\ncode\n```',
    ],
  ])('keeps the next file after %s', (_name, inside, inB) => {
    const body = `<details>\n<summary>🧹 Nitpick comments (2)</summary><blockquote>\n\n<details>\n<summary>README.md (1)</summary><blockquote>\n\nFinding A\n\n${inside}\n\n</blockquote></details>\n<details>\n<summary>src/b.ts (1)</summary><blockquote>\n\nFinding B${inB}\n\n</blockquote></details>\n\n</blockquote></details>\n\n${SETTINGS}`;
    const finding = lateFinding('pull_request_review', {
      pull_request: merged43,
      review: { ...bot.coderabbitReview, body },
    });
    expect(finding?.excerpt).toContain('Finding B');
    expect(finding?.excerpt).not.toContain('<summary>');
    expect(finding?.excerpt).not.toContain('Configuration used');
  });

  // AFA-145 review: the look-ahead for a closing line reads lines as the fence does. A backtick
  // line indented four columns is code in the fence, not its closing line, and a line outside the
  // fence's quote ends it.
  it('reads the closing line of a fence with its indent and its quote', () => {
    const indented = `<details>\n<summary>🧹 Nitpick comments (3)</summary><blockquote>\n\n<details>\n<summary>README.md (2)</summary><blockquote>\n\nFinding A1\n\n\`\`\`js\n\n<details>\n<summary>More</summary>\n\n    \`\`\`\n    x\n    \`\`\`\n\n</details>\n\n---\n\nFinding A2\n\n<details>\n<summary>🔧 Suggested fix</summary>\n\n\`\`\`diff\n-c\n+d\n\`\`\`\n\n</details>\n\n</blockquote></details>\n<details>\n<summary>src/b.ts (1)</summary><blockquote>\n\nFinding B\n\n</blockquote></details>\n\n</blockquote></details>\n\n${SETTINGS}`;
    const review = (body: string): Finding | null =>
      lateFinding('pull_request_review', {
        pull_request: merged43,
        review: { ...bot.coderabbitReview, body },
      });
    expect(review(indented)?.excerpt).toContain('Finding B');
    const quoted = `> <details>\n> <summary>⚠️ Outside diff range comments (1)</summary><blockquote>\n>\n> Finding O\n>\n> \`\`\`js\n>\n> </blockquote></details>\n\n**🧹 Nitpick comments (1)**\n\nFinding N\n\n\`\`\`\ncode\n\`\`\`\n\n${SETTINGS}`;
    const finding = review(quoted);
    expect(finding?.summary).toBe(
      'a review with 1 outside diff range comment and 1 nitpick comment'
    );
    expect(finding?.excerpt).not.toContain('Configuration used');
  });

  // AFA-145 review: only a file's section belongs to a bold title's section. The bots' other
  // sections with a count, such as "🔇 Additional comments (3)", end it.
  it("ends a bold title's section at another section with a count", () => {
    const body = `**🧹 Nitpick comments (1)**\n\n<details>\n<summary>src/a.ts (1)</summary><blockquote>\n\nKeep this\n\n</blockquote></details>\n\n<details>\n<summary>🔇 Additional comments (3)</summary><blockquote>\n\nLGTM stuff\n\n</blockquote></details>\n\n${SETTINGS}`;
    const finding = lateFinding('pull_request_review', {
      pull_request: merged43,
      review: { ...bot.coderabbitReview, body },
    });
    expect(finding?.excerpt).toContain('Keep this');
    expect(finding?.excerpt).not.toContain('LGTM stuff');
  });

  // AFA-145: after a bold title, a file's section in a Markdown quote, or one whose path has a
  // space, belongs to the title's section.
  it.each([
    [
      'in a Markdown quote',
      '> **🧹 Nitpick comments (1)**\n>\n> <details>\n> <summary>src/a.ts (1)</summary>\n>\n> Finding A\n>\n> </details>',
    ],
    [
      'whose path has a space',
      '**🧹 Nitpick comments (1)**\n\n<details>\n<summary>docs/API Guide.md (1)</summary><blockquote>\n\nFinding A\n\n</blockquote></details>',
    ],
  ])("keeps a file's section %s after a bold title", (_name, section) => {
    const finding = lateFinding('pull_request_review', {
      pull_request: merged43,
      review: { ...bot.coderabbitReview, body: `${section}\n\n${SETTINGS}` },
    });
    expect(finding?.excerpt).toContain('Finding A');
    expect(finding?.excerpt).not.toContain('Configuration used');
  });

  // AFA-123: a prompt's tag in an HTML comment paired with a real </details> and took the
  // finding between them.
  it("removes HTML comments before a prompt's tag can pair with a real end tag", () => {
    const body =
      '<details>\n<summary>🧹 Nitpick comments (1)</summary>\n<details>\n<summary>src/a.ts (1)</summary>\n<!-- <details><summary>Prompt for AI Agents</summary> -->\nKeep this\n</details>\n</details>';
    const finding = lateFinding('pull_request_review', {
      pull_request: merged43,
      review: { ...bot.coderabbitReview, body },
    });
    expect(finding?.excerpt).toContain('Keep this');
  });

  // AFA-123: a title that doesn't start its line is text that a finding quotes, not a section.
  it('counts a title that is not collapsed only at the start of its line', () => {
    const body = `**🧹 Nitpick comments (1)**\n\nThe title Nitpick comments (1) here\n\n${SETTINGS}`;
    const finding = lateFinding('pull_request_review', {
      pull_request: merged43,
      review: { ...bot.coderabbitReview, body },
    });
    expect(finding?.summary).toBe('a review with 1 nitpick comment');
    expect(finding?.excerpt).toContain('The title Nitpick comments (1) here');
  });

  // AFA-123: a title in a tag inside its <summary> is still collapsed, so its section keeps the
  // collapsed sections of files inside it.
  it('reads a title in a tag inside its summary as collapsed', () => {
    const body = `<details>\n<summary><b>🧹 Nitpick comments (1)</b></summary><blockquote>\n\n<details>\n<summary>src/a.ts (1)</summary><blockquote>\n\nKeep this\n\n</blockquote></details>\n\n</blockquote></details>\n\n${SETTINGS}`;
    const finding = lateFinding('pull_request_review', {
      pull_request: merged43,
      review: { ...bot.coderabbitReview, body },
    });
    expect(finding?.excerpt).toBe('> Nitpick comments (1)\n>\n> src/a.ts (1)\n>\n> Keep this');
  });

  // AFA-123: the summary counted a title that a nitpick quotes.
  it('counts only the titles of the sections that it quotes', () => {
    const body =
      '<details>\n<summary>🧹 Nitpick comments (2)</summary><blockquote>\n\nThe title Nitpick comments (2) is counted twice.\n\n</blockquote></details>';
    const finding = lateFinding('pull_request_review', {
      pull_request: merged43,
      review: { ...bot.coderabbitReview, body },
    });
    expect(finding?.summary).toBe('a review with 2 nitpick comments');
  });

  // AFA-123: CodeRabbit can write a section in a Markdown quote, with `> ` before each line.
  it('drops a prompt section inside a Markdown quote', () => {
    const body =
      '> <details>\n> <summary>⚠️ Outside diff range comments (1)</summary>\n> \n> Keep this\n> \n> <details>\n> <summary>🤖 Prompt for AI Agents</summary>\n> \n> agent instructions\n> \n> </details>\n> \n> </details>';
    const finding = lateFinding('pull_request_review', {
      pull_request: merged43,
      review: { ...bot.coderabbitReview, body },
    });
    expect(finding?.summary).toBe('a review with 1 outside diff range comment');
    expect(finding?.excerpt).toContain('Keep this');
    expect(finding?.excerpt).not.toContain('agent instructions');
  });

  it('reports a bot comment on a merged PR that is not one of its routine notes', () => {
    const finding = lateFinding('issue_comment', {
      issue: mergedIssue43,
      comment: { ...bot.codexNoFindings, body: 'Codex Review: one finding, see below.' },
    });
    expect(finding).toMatchObject({ closed: 'merged', summary: 'a comment' });
  });

  it('reports a bot comment that only mentions the words of a routine note', () => {
    for (const body of [
      'The usage limit parser drops valid values.',
      "This check didn't find any major issues in tests, but `1 ft` is still lost.",
      'Review limit reached: the size check fails on `src/units.ts`.',
      "**Codex Review: Didn't find any major issues** in tests, but `1 ft` is still lost.",
      'Unlike <!-- codex-pull-request-review-summary --> notes, this one is a finding.',
    ]) {
      const finding = lateFinding('issue_comment', {
        issue: mergedIssue43,
        comment: { ...bot.codexNoFindings, body },
      });
      expect(finding?.summary).toBe('a comment');
    }
  });

  it.each([
    ['a summary', 'coderabbitSummary'],
    ["Codex's summary", 'codexSummary'],
    ['a reply to a review request', 'coderabbitRefusal'],
    ['a rate-limit note', 'coderabbitRateLimitNote'],
    ["Codex's no-findings comment", 'codexNoFindings'],
    ["Codex's reply to a task (AFA-109)", 'codexTaskReply'],
  ])('skips %s', (_, name) => {
    expect(lateFinding('issue_comment', { issue: mergedIssue43, comment: bot[name] })).toBeNull();
  });

  it('reports a summary that has no link to a Codex task', () => {
    const body = bot.codexTaskReply.body.replace(/\[View task →\]\([^)]*\)\s*$/, '');
    const finding = lateFinding('issue_comment', {
      issue: mergedIssue43,
      comment: { ...bot.codexTaskReply, body },
    });
    expect(finding?.summary).toBe('a comment');
  });

  it('skips a task reply only from Codex', () => {
    const coderabbit = { login: 'coderabbitai[bot]', type: 'Bot' };
    const finding = lateFinding('issue_comment', {
      issue: mergedIssue43,
      comment: { ...bot.codexTaskReply, user: coderabbit },
    });
    expect(finding?.summary).toBe('a comment');
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
      lateFinding('push', {
        pull_request: merged43,
        comment: bot.codexThreadComment,
        review: bot.coderabbitNitpickReview,
      })
    ).toBeNull();
    const ghost = { ...bot.codexThreadComment, user: null };
    expect(
      lateFinding('pull_request_review_comment', { pull_request: merged43, comment: ghost })
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

  it("removes nested sections and ones with attributes, and doesn't split an emoji", () => {
    const nested =
      'Intro\n<details><summary>A</summary>\n<details><summary>B</summary>\ninner\n</details>\nouter\n</details>\n<details open><summary>Logs</summary>\nLOG\n</details>\nTail';
    expect(excerpt(nested)).toBe('> Intro\n>\n> Tail');
    expect(excerpt(`${'a'.repeat(599)}🧹 tail`)).toBe(`> ${'a'.repeat(599)}🧹…`);
  });

  // A code span ends at a blank line, as in CommonMark, so this backtick masks nothing.
  it('removes a collapsed section after a stray backtick', () => {
    const body =
      'it`s broken\n\n<details><summary>Prompt</summary>agent instructions</details>\n\nsee `x`';
    expect(excerpt(body)).toBe('> it`s broken\n>\n> see `x`');
  });

  // AFA-109: the old pattern also took the spaces that start the next line.
  it('keeps the indent of the line after removed blank lines', () => {
    expect(excerpt('x\n\n\n    indented code')).toBe('> x\n>\n>     indented code');
  });

  it('keeps one blank line where there were several, even with spaces on them', () => {
    expect(excerpt('a\n\nb\n\n\nc\n \n\nd\n\n \ne')).toBe('> a\n>\n> b\n>\n> c\n>\n> d\n>\n> e');
  });

  // AFA-123: the backticks inside the string closed the fence, so the real closing fence paired
  // with the next fence and hid the prompt between them.
  it('closes a fence only at a line of backticks', () => {
    const body =
      'Fix it.\n\n```js\nconst f = "```";\n```\n\n<details>\n<summary>🤖 Prompt for AI Agents</summary>\n\nagent instructions\n\n</details>\n\n```js\nok();\n```';
    expect(excerpt(body)).toBe(
      '> Fix it.\n>\n> ```js\n> const f = "```";\n> ```\n>\n> ```js\n> ok();\n> ```'
    );
  });

  // AFA-123: the review of the first fix found these inputs, where reading code by lines
  // removed less than main did.
  it.each([
    [
      'with \\r\\n line breaks',
      `Fix it.\r\n\r\n\`\`\`js\r\nx();\r\n\`\`\`\r\n\r\n${PROMPT.replace(/\n/g, '\r\n')}\r\n\r\nAfter`,
      '> Fix it.\n>\n> ```js\n> x();\n> ```\n>\n> After',
    ],
    [
      'after a fence on a list item',
      `1. \`\`\`js\n   foo()\n   \`\`\`\n\n${PROMPT}\n\nAfter`,
      '> 1. ```js\n>    foo()\n>    ```\n>\n> After',
    ],
    [
      'after a quote that ends an unclosed fence',
      `> \`\`\`js\n> x()\n\n${PROMPT}\n\nAfter`,
      '> > ```js\n> > x()\n>\n> After',
    ],
    [
      'after an unclosed fence',
      `\`\`\`js\nx();\n\n${PROMPT}\n\nAfter`,
      '> ```js\n> x();\n>\n> After',
    ],
    [
      "in a list item's indented paragraph",
      '1. Item\n\n    See <details><summary>Prompt</summary>agent</details> here\n\nAfter',
      '> 1. Item\n>\n>     See  here\n>\n> After',
    ],
  ])('removes a prompt %s', (_name, body, expected) => {
    expect(excerpt(body)).toBe(expected);
  });

  // AFA-123: a cut inside a code span left the HTML in it live. The span gets its closing
  // backticks, so the HTML stays code.
  it.each([
    [
      'closes a code span that the cut splits',
      `${'a'.repeat(590)} \`<details><summary>a</summary>b</details>\``,
      `> ${'a'.repeat(590)} \`<details\`…`,
    ],
    ['keeps most of a long code span', `a \`${'b'.repeat(700)}\``, `> a \`${'b'.repeat(597)}\`…`],
    [
      "cuts before a code span when the cut splits the span's opening backticks",
      `${'a'.repeat(598)} \`\`x <b>y</b>\`\` z`,
      `> ${'a'.repeat(598)}…`,
    ],
  ])('%s', (_name, body, expected) => {
    expect(excerpt(body)).toBe(expected);
  });

  it('removes an HTML comment that is left behind when an inner one is removed', () => {
    // Removing `<!---->` from `<!<!---->--` leaves `<!--` (CodeQL alert 9).
    expect(excerpt('<!<!---->-- hidden -->Shown')).toBe('> Shown');
  });
});

describe('plainText', () => {
  it('keeps the text of HTML and drops tags, comments and extra blank lines', () => {
    expect(
      plainText('<summary>Title</summary><blockquote>\n\n\n<!-- x -->\nBody `a < b`\n</blockquote>')
    ).toBe('Title\n\nBody `a < b`');
  });

  it('keeps one blank line where there were several, even with spaces on them', () => {
    expect(plainText('a\n\nb\n\n\nc\n \n\nd\n\n \ne')).toBe('a\n\nb\n\nc\n\nd\n\ne');
  });

  // AFA-109: a nitpick quoted `Promise<string>` as `Promise`.
  it('keeps code and placeholders that look like tags', () => {
    const code = 'Use `Promise<string>` and `function f<T>(a: Array<T>) {}`, then check `<sha>`.';
    expect(plainText(code)).toBe(code);
    expect(plainText('Map<A, B> and <a, b>')).toBe('Map<A, B> and <a, b>');
  });

  it('keeps tags inside code spans and fenced blocks', () => {
    const inline = 'Wrap it in `<details>` and ``<summary>`x`</summary>``, then use `<b>`.';
    expect(plainText(inline)).toBe(inline);
    expect(plainText('```html\n<details><summary>x</summary></details>\n```\n<b>bold</b>')).toBe(
      '```html\n<details><summary>x</summary></details>\n```\nbold'
    );
    // A run of backticks with no closing run of the same length starts no code span.
    expect(plainText('it`s <b>bold</b>')).toBe('it`s bold');
    expect(plainText('`` x ` <i>y</i>')).toBe('`` x ` y');
  });

  it('reads an escaped backtick as text, and keeps a fence across a blank line', () => {
    expect(plainText('Use \\`<b>x</b>\\` here')).toBe('Use \\`x\\` here');
    const fence = '```html\n<b>a</b>\n\n<i>b</i>\n```';
    expect(plainText(`${fence}\n<b>c</b>`)).toBe(`${fence}\nc`);
    // A fence can start after up to three spaces.
    const indented = '   ```html\n   <b>a</b>\n\n   <i>b</i>\n   ```';
    expect(plainText(`x\n${indented}\n<b>c</b>`)).toBe(`x\n${indented}\nc`);
    // Two backslashes are one plain backslash, so the backtick after them opens a span.
    expect(plainText('a \\\\`<b>x</b>` b')).toBe('a \\\\`<b>x</b>` b');
  });

  // AFA-123: the tags in these code blocks were stripped.
  it.each([
    ['an indented code block', 'Example:\n\n    <b>x</b>'],
    [
      'a fence indented 4 spaces in a list item',
      '- item\n\n    ```html\n    <b>a</b>\n\n    <i>b</i>\n    ```',
    ],
    ['a closing run longer than the opening run', '```\n<b>a</b>\n\nx\n````'],
    ['a tilde fence', '~~~html\n<b>a</b>\n~~~'],
    ['a fence whose code has a line that starts with >', '```md\n> ```\n<b>x</b>\n```'],
    [
      'a fence whose closing line is indented 4 columns more',
      'Code:\n\n  ```\n     ```\n<b>x</b>\n  ```',
    ],
    ['an indented block right after a fence', '```\na\n```\n    <b>x</b>'],
    // AFA-145: a shorter run, or a run of the other mark, doesn't close a fence.
    ['a fence of four backticks with a line of three in it', '````md\n```\n<b>x</b>\n````'],
    ['a tilde fence with a line of backticks in it', '~~~md\n```\n<b>x</b>\n~~~'],
  ])('keeps the tags in %s', (_name, code) => {
    expect(plainText(code)).toBe(code);
  });

  // AFA-123: a bot that doesn't close a fence more likely broke its Markdown than put the rest of
  // its comment in code, so the fence is text, as on main.
  it('reads an unclosed fence as text', () => {
    expect(plainText('```html\n<b>a</b>\n\n<i>b</i>')).toBe('```html\na\n\nb');
  });

  // AFA-123: the second review of the fix found these inputs.
  it.each([
    [
      "a fence in a list item, with a code line that starts with '>'",
      '1. ```sh\n   > x\n   <b>y</b>\n   ```\n\nafter <i>z</i>',
      '1. ```sh\n   > x\n   <b>y</b>\n   ```\n\nafter z',
    ],
    [
      "a paragraph of an outer list item after a nested item's end",
      '- a\n  - b\n\n  para\n\n    x <b>y</b>',
      '- a\n  - b\n\n  para\n\n    x y',
    ],
    ["a line that goes on with a quote's paragraph", '> note\n    <b>x</b>', '> note\n    x'],
    [
      'a fence after a list item whose fence a line at column 0 ends',
      '1. ```js\n   <b>a</b>\n```\n<i>b</i>\n```',
      '1. ```js\n   <b>a</b>\n```\n<i>b</i>\n```',
    ],
    [
      'a closing line with a tab after its marks',
      '```\n<b>a</b>\n```\t\n<i>b</i>',
      '```\n<b>a</b>\n```\t\nb',
    ],
    // AFA-145: a line without the fence's quote marks ends the quote and the fence.
    [
      'a line without the quote marks of a quoted fence',
      '> ```\n> <b>a</b>\n```\n<i>b</i>',
      '> ```\n> <b>a</b>\n```\nb',
    ],
  ])('reads %s', (_name, html, expected) => {
    expect(plainText(html)).toBe(expected);
  });

  it('drops the tags that the bots write, with their attributes', () => {
    expect(plainText('<img data-x2="1" aria-label="i" src="a">x')).toBe('x');
    expect(
      plainText(
        '<sub><sub>P2</sub></sub> <strong>Fix</strong>\n<a href="https://example.com/a">link</a> <img src="https://example.com/i.png" alt="i" width="220">\n<relative-time datetime="2026-10-08T04:39:34Z">today</relative-time><br/>'
      )
    ).toBe('P2 Fix\nlink \ntoday');
  });

  it('keeps the indent of the line after removed blank lines', () => {
    expect(plainText('x\n\n\n    indented')).toBe('x\n\n    indented');
  });

  it('removes tags and comments that are left behind when inner ones are removed', () => {
    // CodeQL alerts 8 and 10: removing `<b>` from `<<b>i>` leaves `<i>`, and removing `<b>`
    // from `<!<b>-- -->` leaves an HTML comment.
    expect(plainText('<<b>i>Shown')).toBe('Shown');
    expect(plainText('<!<b>-- hidden -->Shown')).toBe('Shown');
    expect(plainText('<!<!---->-- hidden -->Shown')).toBe('Shown');
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
    const ours = {
      number: 8,
      title: 'Bot findings after #43 merged',
      html_url: 'https://github.com/o/r/issues/8',
    };
    const created = fakeFetch([
      [{ number: 7, title: 'Bot findings after #42 merged', html_url: 'x' }],
      new Response('{"message":"Validation Failed"}', { status: 422 }),
      ours,
      [ours],
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
      'GET https://api.test/repos/o/r/issues?labels=late-bot-finding&state=open&per_page=100',
    ]);
    // The headers GitHub's REST API asks for.
    expect(created.calls[0].init.headers).toEqual({
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer t',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    });
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

  it('moves its finding to an older record that another run opened at the same time', async () => {
    const older = {
      id: 7007,
      number: 7,
      title: 'Bot findings after #43 merged',
      html_url: 'https://github.com/o/r/issues/7',
    };
    const ours = {
      id: 8008,
      number: 8,
      title: 'Bot findings after #43 merged',
      html_url: 'https://github.com/o/r/issues/8',
    };
    const { calls, fetch } = fakeFetch([[], {}, ours, [ours, older], {}, {}]);
    await expect(
      fileOnGitHub(finding, { repo: 'o/r', token: 't', apiUrl: 'https://api.test', fetch })
    ).resolves.toBe('https://github.com/o/r/issues/7');
    expect(calls.slice(4).map(c => `${c.init.method} ${c.url}`)).toEqual([
      'POST https://api.test/repos/o/r/issues/7/comments',
      'PATCH https://api.test/repos/o/r/issues/8',
    ]);
    // GitHub needs the older issue's ID, not its number, to close ours as its duplicate.
    expect(JSON.parse(calls[5].init.body ?? '')).toEqual({
      state: 'closed',
      state_reason: 'duplicate',
      duplicate_issue_id: 7007,
    });
  });

  it('reads every page of open records', async () => {
    const page2 =
      'https://api.test/repos/o/r/issues?labels=late-bot-finding&state=open&per_page=100&page=2';
    const record = {
      number: 9,
      title: 'Bot findings after #43 merged',
      html_url: 'https://github.com/o/r/issues/9',
    };
    const { calls, fetch } = fakeFetch([
      new Response(JSON.stringify([{ number: 1, title: 'other', html_url: 'x' }]), {
        status: 200,
        headers: { link: `<${page2}>; rel="next"` },
      }),
      [record],
      {},
    ]);
    await expect(
      fileOnGitHub(finding, { repo: 'o/r', token: 't', apiUrl: 'https://api.test', fetch })
    ).resolves.toBe('https://github.com/o/r/issues/9');
    expect(calls[1].url).toBe(page2);
  });

  it('fails when GitHub refuses to create the label', async () => {
    const { fetch } = fakeFetch([[], new Response('Forbidden', { status: 403 })]);
    await expect(
      fileOnGitHub(finding, { repo: 'o/r', token: 't', apiUrl: 'https://api.test', fetch })
    ).rejects.toThrow('POST https://api.test/repos/o/r/labels answered 403: Forbidden');
  });

  it('fails with the status when GitHub refuses', async () => {
    const { fetch } = fakeFetch([new Response('Forbidden', { status: 403 })]);
    await expect(
      fileOnGitHub(finding, { repo: 'o/r', token: 't', apiUrl: 'https://api.test', fetch })
    ).rejects.toThrow(
      'GET https://api.test/repos/o/r/issues?labels=late-bot-finding&state=open&per_page=100 answered 403: Forbidden'
    );
  });

  it("uses GitHub's API by default, and quotes only the first 200 characters of an error", async () => {
    const { fetch } = fakeFetch([new Response('x'.repeat(300), { status: 500 })]);
    await expect(fileOnGitHub(finding, { repo: 'o/r', token: 't', fetch })).rejects.toThrow(
      new RegExp(
        `^GET https://api\\.github\\.com/repos/o/r/issues\\?labels=late-bot-finding&state=open&per_page=100 answered 500: x{200}$`
      )
    );
  });

  it("files a Linear issue in the project when the PR has none, and comments on the PR's one", async () => {
    const ours = { id: 'new', url: 'https://linear.app/i/1', createdAt: '2026-10-07T12:00:00Z' };
    const created = fakeFetch([
      { data: { issues: { nodes: [] } } },
      { data: { issueCreate: { issue: ours } } },
      { data: { issues: { nodes: [ours] } } },
    ]);
    await expect(
      fileOnLinear(finding, {
        apiKey: 'k',
        teamId: 'team',
        projectId: 'project',
        fetch: created.fetch,
      })
    ).resolves.toBe('https://linear.app/i/1');
    expect(created.calls[0].url).toBe('https://api.linear.app/graphql');
    expect(created.calls[0].init.method).toBe('POST');
    expect(created.calls[0].init.headers).toEqual({
      Authorization: 'k',
      'Content-Type': 'application/json',
    });
    // Only open records count.
    expect(JSON.parse(created.calls[0].init.body ?? '').query).toContain(
      'state: { type: { nin: ["completed", "canceled"] } }'
    );
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

  it('moves its finding to an older Linear record filed at the same time, and deletes its own', async () => {
    const older = { id: 'old', url: 'https://linear.app/i/0', createdAt: '2026-10-07T11:59:59Z' };
    const ours = { id: 'new', url: 'https://linear.app/i/1', createdAt: '2026-10-07T12:00:00Z' };
    const { calls, fetch } = fakeFetch([
      { data: { issues: { nodes: [] } } },
      { data: { issueCreate: { issue: ours } } },
      { data: { issues: { nodes: [ours, older] } } },
      { data: { commentCreate: { success: true } } },
      { data: { issueDelete: { success: true } } },
    ]);
    await expect(
      fileOnLinear(finding, { apiKey: 'k', teamId: 'team', projectId: 'project', fetch })
    ).resolves.toBe('https://linear.app/i/0');
    expect(JSON.parse(calls[3].init.body ?? '').query).toContain('commentCreate(input: $input)');
    expect(JSON.parse(calls[3].init.body ?? '').variables).toEqual({
      input: { issueId: 'old', body: recordEntry(finding) },
    });
    expect(JSON.parse(calls[4].init.body ?? '').query).toContain('issueDelete(id: $id)');
    expect(JSON.parse(calls[4].init.body ?? '').variables).toEqual({ id: 'new' });
  });

  it('fails when Linear answers that a comment or issue was not created', async () => {
    const comment = fakeFetch([
      { data: { issues: { nodes: [{ id: 'abc', url: 'https://linear.app/i/2' }] } } },
      { data: { commentCreate: { success: false } } },
    ]);
    await expect(
      fileOnLinear(finding, { apiKey: 'k', teamId: 't', projectId: 'p', fetch: comment.fetch })
    ).rejects.toThrow('Linear: commentCreate did not succeed');
    const issue = fakeFetch([
      { data: { issues: { nodes: [] } } },
      { data: { issueCreate: { success: false, issue: null } } },
    ]);
    await expect(
      fileOnLinear(finding, { apiKey: 'k', teamId: 't', projectId: 'p', fetch: issue.fetch })
    ).rejects.toThrow('Linear: issueCreate did not succeed');
    expect(JSON.parse(issue.calls[1].init.body ?? '').query).toContain('success');
  });

  it("fails with Linear's error message", async () => {
    const { fetch } = fakeFetch([{ errors: [{ message: 'Authentication required' }] }]);
    await expect(
      fileOnLinear(finding, { apiKey: 'k', teamId: 't', projectId: 'p', fetch })
    ).rejects.toThrow('Linear: Authentication required');
  });
});
