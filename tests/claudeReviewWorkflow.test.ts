import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Text in a PR can tell Claude to post a secret. The action writes its GitHub token into
// .git/config. Claude Code runs read-only shell commands such as `grep -r` without an allow rule,
// and Grep and Glob apply denied paths only as far as they can. So Claude gets no shell, no Grep
// and no Glob, and Read can't open the places that hold secrets. GitHub runs this workflow with
// secrets only for a PR from this repository, so these tests read the file.
const workflow = readFileSync('.github/workflows/claude-review.yml', 'utf8');

/** The comma-separated rules of a flag in `claude_args`. */
function rules(flag: string): string[] {
  const list = new RegExp(`^ +--${flag} "([^"]*)"$`, 'm').exec(workflow);
  return list ? list[1].split(',') : [];
}

describe('Claude review workflow', () => {
  it('lets Claude post inline comments and nothing else without asking', () => {
    expect(rules('allowedTools')).toEqual(['mcp__github_inline_comment__create_inline_comment']);
  });

  it("denies the shell, Grep, Glob, and reads of .git, /proc and the runner's temporary folder", () => {
    expect(rules('disallowedTools')).toEqual(
      expect.arrayContaining([
        'Bash',
        'Grep',
        'Glob',
        'Read(./.git/**)',
        'Read(//proc/**)',
        'Read(/${{ runner.temp }}/**)',
      ])
    );
  });

  it("ignores the repository's Claude settings, which could allow more", () => {
    expect(workflow).toMatch(/^ +--setting-sources user$/m);
  });

  it('checks out the base commit without a stored token', () => {
    expect(workflow).toContain('ref: ${{ github.event.pull_request.base.sha }}');
    expect(workflow).toContain('persist-credentials: false');
  });

  it('pins each action to a commit', () => {
    const actions = [...workflow.matchAll(/^ +- uses: (\S+)/gm)].map(([, action]) => action);
    expect(actions).toContain(
      'anthropics/claude-code-action@6fed3ca145920b639991cb756090506e1bcaf515'
    );
    for (const action of actions) expect(action).toMatch(/@[0-9a-f]{40}$/);
  });
});
