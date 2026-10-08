import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Text in a PR or a comment can tell Claude to post a secret. The action writes its GitHub token
// into .git/config, a `gh pr comment --body-file` can post any file, and gh's `--jq` can print
// its environment. So Claude gets only the reads and commands below. GitHub runs this workflow
// with secrets only for a PR from this repository, so these tests read the file.
const workflow = readFileSync('.github/workflows/claude-review.yml', 'utf8');
const PR = '${{ github.event.pull_request.number }}';

/** The comma-separated rules of a flag in `claude_args`. */
function rules(flag: string): string[] {
  const list = new RegExp(`^ +--${flag} "([^"]*)"$`, 'm').exec(workflow);
  return list ? list[1].split(',') : [];
}

describe('Claude review workflow', () => {
  it('lets Claude run only the exact gh commands that read the PR', () => {
    expect(rules('allowedTools').sort()).toEqual([
      `Bash(gh pr diff ${PR})`,
      `Bash(gh pr view ${PR})`,
      'mcp__github_inline_comment__create_inline_comment',
    ]);
  });

  it("denies reads of .git, /proc and the runner's temporary folder", () => {
    expect(rules('disallowedTools')).toEqual([
      'Read(./.git/**)',
      'Read(//proc/**)',
      'Read(/${{ runner.temp }}/**)',
    ]);
  });

  it('pins each action to a commit', () => {
    const actions = [...workflow.matchAll(/^ +- uses: (\S+)/gm)].map(([, action]) => action);
    expect(actions).toHaveLength(2);
    for (const action of actions) expect(action).toMatch(/@[0-9a-f]{40}$/);
  });
});
