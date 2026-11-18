import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { env } from 'node:process';
import { describe, expect, it } from 'vitest';

// A push to main runs only test and package. nightly.yml runs all of CI on main, with mutation
// testing and the docs audit. Pull requests run every job, and ci-ok requires each of them.
const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
const nightly = readFileSync('.github/workflows/nightly.yml', 'utf8');

/** A job's lines, from its name to the next job. */
function job(name: string): string {
  const start = ci.indexOf(`\n  ${name}:\n`);
  if (start < 0) throw new Error(`No job ${name}`);
  const next = /\n {2}(?!#)\S/.exec(ci.slice(start + 1));
  return next ? ci.slice(start, start + 1 + next.index) : ci.slice(start);
}
const jobIf = (name: string): string | undefined => /^ {4}if: (.*)$/m.exec(job(name))?.[1];

const okStep = job('ci-ok');
const results = /^ {10}RESULTS: (.*)$/m.exec(okStep)?.[1];
const script = (/^ {8}run: \|\n((?: {10}.*\n?)+)/m.exec(okStep)?.[1] ?? '').replace(/^ {10}/gm, '');

/** Runs ci-ok's script with RESULTS set as GitHub would set it. */
const ciOk = (value: string): number | null =>
  spawnSync('bash', ['-e', '-c', script], { env: { ...env, RESULTS: value } }).status;

describe('CI on a push to main', () => {
  it('runs on pushes to main, on pull requests to main and from nightly.yml', () => {
    expect(ci).toMatch(
      /^on:\n {2}push:\n {4}branches: \[main\]\n {2}pull_request:\n {4}branches: \[main\]\n(?: {2}#.*\n)* {2}workflow_call:\n/m
    );
  });

  it.each(['mutation-inventory', 'docs'])('skips %s on a push only', name => {
    expect(jobIf(name)).toBe("github.event_name != 'push'");
  });

  it('skips the shards and the report with the inventory', () => {
    expect(job('mutation')).toMatch(/^ {4}needs: mutation-inventory$/m);
    expect(jobIf('mutation')).toBeUndefined();
    expect(jobIf('mutation-report')).toBe(
      "${{ !cancelled() && needs.mutation-inventory.result == 'success' }}"
    );
  });

  it.each(['test', 'package'])('runs %s on every event', name => {
    expect(jobIf(name)).toBeUndefined();
  });

  it('requires only test and package on a push, and every job otherwise', () => {
    expect(jobIf('ci-ok')).toBe('always()');
    expect(okStep).toContain('needs: [test, package, mutation, mutation-report, docs]');
    expect(results).toBe(
      "${{ github.event_name == 'push' && format('{0} {1}', needs.test.result, needs.package.result) || join(needs.*.result, ' ') }}"
    );
  });

  // These cases run only the step's script. Each RESULTS value is the one that the expression
  // above gives for the named case, worked out by hand: on a push, the results of test and package;
  // otherwise, of all five jobs in the order of needs.
  it.each([
    ['test and package pass on a push', 'success success', 0],
    ['package fails on a push', 'success failure', 1],
    ['test is cancelled on a push', 'cancelled success', 1],
    ['every job passes on a pull request', 'success success success success success', 0],
    ['mutation skips on a pull request', 'success success skipped skipped success', 1],
    ['docs skips on a pull request', 'success success success success skipped', 1],
    ['mutation-report fails on a pull request', 'success success success failure success', 1],
  ])('when %s, RESULTS is "%s" and ci-ok exits with %i', (_name, value, status) => {
    expect(ciOk(value)).toBe(status);
  });
});

describe('the nightly workflow', () => {
  it('runs every night and by hand', () => {
    expect(nightly).toMatch(
      /^on:\n {2}schedule:\n {4}- cron: '\d+ \d+ \* \* \*'\n {2}workflow_dispatch:\n\n/m
    );
  });

  it('runs all of CI on main only, with read-only contents', () => {
    expect(nightly).toMatch(
      /^jobs:\n {2}ci:\n(?: {4}#.*\n)* {4}if: github\.ref == 'refs\/heads\/main'\n {4}uses: \.\/\.github\/workflows\/ci\.yml\n$/m
    );
    expect(nightly).toMatch(/^permissions:\n {2}contents: read\n\n/m);
  });
});
