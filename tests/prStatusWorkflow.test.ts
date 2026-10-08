import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// GitHub runs .github/workflows/pr-status.yml from main for most of its events, so a PR can't
// run its own copy. These tests read the file instead. Each expected value is from AFA-108.
const workflow = readFileSync('.github/workflows/pr-status.yml', 'utf8');

/** The `types` list of an event under `on:`. */
function types(event: string): string[] {
  const list = new RegExp(`^ {2}${event}:\\n {4}types: \\[([^\\]]*)\\]`, 'm').exec(workflow);
  return list ? list[1].split(',').map(type => type.trim()) : [];
}

describe('pr-status workflow', () => {
  it('runs when a comment or a review comment is deleted', () => {
    expect(types('issue_comment')).toEqual(['created', 'edited', 'deleted']);
    expect(types('pull_request_review_comment')).toEqual(['created', 'deleted']);
  });

  it('groups a workflow run that lists no PRs by its head repository and branch', () => {
    // The keys before the new one are the same as on main, so PR events, comments on PRs,
    // same-repo PR runs and status events keep their groups.
    const group = /^ {2}group: (.*)$/m.exec(workflow)?.[1];
    expect(group).toBe(
      "pr-status-${{ github.event.pull_request.number || github.event.issue.number || github.event.workflow_run.pull_requests[0].number || github.event.sha || (github.event.workflow_run && format('{0}:{1}', github.event.workflow_run.head_repository.full_name, github.event.workflow_run.head_branch)) || github.event_name }}"
    );
  });
});
