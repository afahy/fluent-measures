import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Runs the same check as the "Validate pull request title" step in
// .github/workflows/commitlint.yml.
const commitlint = resolve('node_modules/.bin/commitlint');
const config = 'commitlint.pr-title.config.js';

function lintTitle(title: string): Promise<number | null> {
  return new Promise(done => {
    const child = spawn(commitlint, ['--config', config], { stdio: ['pipe', 'ignore', 'ignore'] });
    child.on('close', done);
    child.stdin.end(`${title}\n`);
  });
}

// Each case starts a commitlint process, so run them in parallel, with room for slow runners.
describe.concurrent('PR title commitlint config', { timeout: 20_000 }, () => {
  it.each([
    'fix: normal title',
    'fix(ci): good scope',
    'revert: fix: make the changeset reminder non-blocking',
    'fix: a title that is exactly sixty-five characters long for tests',
    'fix: utf-8 handling',
  ])('accepts %j', async title => {
    expect(await lintTitle(title)).toBe(0);
  });

  it.each([
    // Skipped by commitlint's default ignores unless they are turned off.
    "Merge branch 'main' into feature",
    'Revert "fix: make the changeset reminder non-blocking"',
    'fixup! fix: normal title',
    'squash! fix: normal title',
    '1.2.3',
    'Automatic merge from upstream',
    // Over the 65-character title limit.
    'fix: a title that is exactly sixty-six characters long for testing',
    // Linear ticket IDs belong on the Fixes line.
    'fix: something (AFA-22)',
    'fix: _AFA-123_ update parser',
    'AFA-22: Make the changeset reminder non-blocking',
    // Rules shared with commits.
    'fix(hooks): scope not in scope-enum',
    'Enforce conventional commit messages',
  ])('rejects %j', async title => {
    expect(await lintTitle(title)).not.toBe(0);
  });
});
