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
    // PR events, comments on PRs and same-repo PR runs keep their groups. Only status events had
    // a `sha`, and the workflow no longer runs on them (AFA-143).
    const group = /^ {2}group: (.*)$/m.exec(workflow)?.[1];
    expect(group).toBe(
      "pr-status-${{ github.event.pull_request.number || github.event.issue.number || github.event.workflow_run.pull_requests[0].number || (github.event.workflow_run && format('{0}:{1}', github.event.workflow_run.head_repository.full_name, github.event.workflow_run.head_branch)) || github.event_name }}"
    );
  });

  // AFA-143: only CodeRabbit sent status events, and its state is only a note in pr:status.
  it('runs on no status event', () => {
    const triggers = /^on:\n((?: {2}.*\n|\n)*)/m.exec(workflow)?.[1] ?? '';
    expect(triggers).toMatch(/^ {2}pull_request:$/m);
    expect(triggers).not.toMatch(/^ {2}status:/m);
    expect(workflow).not.toContain("github.event_name != 'status'");
  });

  it('keeps the triggers for pushes, reviews, comments and CI runs', () => {
    expect(types('pull_request')).toEqual([
      'opened',
      'synchronize',
      'reopened',
      'ready_for_review',
      'converted_to_draft',
    ]);
    expect(types('pull_request_review')).toEqual(['submitted', 'dismissed']);
    expect(workflow).toMatch(
      /^ {2}workflow_run:\n {4}workflows: \[CI, Commitlint, Regression test\]\n {4}types: \[in_progress, completed\]$/m
    );
  });
});
