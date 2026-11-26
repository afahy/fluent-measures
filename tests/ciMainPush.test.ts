import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { env } from 'node:process';
import { describe, expect, it } from 'vitest';

// A push to main runs only test and package: the changes job tells the mutation and docs jobs to
// skip. nightly.yml runs all of CI on main, with mutation testing and the docs audit. A pull request
// runs each of them whose inputs it changes (tests/ciChanges.test.ts).
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
const script = (/^ {8}run: \|\n((?: {10}.*\n?)+)/m.exec(okStep)?.[1] ?? '').replace(/^ {10}/gm, '');

/**
 * Runs ci-ok's script on a push, as GitHub sets NEEDS: the changes job outputs false for both
 * gates, so the mutation and docs jobs skip.
 */
const ciOkOnPush = (test: string, pkg: string): number | null => {
  const needs = {
    changes: { result: 'success', outputs: { mutation: 'false', docs: 'false' } },
    test: { result: test, outputs: {} },
    package: { result: pkg, outputs: {} },
    'mutation-inventory': { result: 'skipped', outputs: {} },
    mutation: { result: 'skipped', outputs: {} },
    'mutation-report': { result: 'skipped', outputs: {} },
    docs: { result: 'skipped', outputs: {} },
  };
  return spawnSync('bash', ['-e', '-c', script], {
    env: { ...env, NEEDS: JSON.stringify(needs) },
  }).status;
};

describe('CI on a push to main', () => {
  it('runs on pushes to main, on pull requests to main and from nightly.yml', () => {
    expect(ci).toMatch(
      /^on:\n {2}push:\n {4}branches: \[main\]\n {2}pull_request:\n {4}branches: \[main\]\n(?: {2}#.*\n)* {2}workflow_call:\n/m
    );
  });

  it.each([
    ['mutation-inventory', 'mutation'],
    ['docs', 'docs'],
  ])('runs %s only when the changes job says so', (name, output) => {
    expect(job(name)).toMatch(/^ {4}needs: changes$/m);
    expect(jobIf(name)).toBe(`needs.changes.outputs.${output} == 'true'`);
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

  it('runs full tests on Node 24, adds Node 22 in Nightly and always checks both packages', () => {
    expect(job('test')).toContain(
      "node-version: ${{ fromJSON((github.event_name == 'schedule' || github.event_name == 'workflow_dispatch') && '[22,24]' || '[24]') }}"
    );
    expect(job('package')).toContain('node-version: [22, 24]');
  });

  it('requires every job through ci-ok, which reads each result', () => {
    expect(jobIf('ci-ok')).toBe('always()');
    expect(okStep).toContain(
      'needs: [changes, test, package, mutation-inventory, mutation, mutation-report, docs]'
    );
    expect(okStep).toContain('NEEDS: ${{ toJSON(needs) }}');
    expect(okStep).not.toContain('RESULTS:');
  });

  it.each([
    ['test and package pass', 'success', 'success', 0],
    ['package fails', 'success', 'failure', 1],
    ['test is cancelled', 'cancelled', 'success', 1],
  ])('on a push where %s, ci-ok exits with %i', (_name, test, pkg, status) => {
    expect(ciOkOnPush(test, pkg)).toBe(status);
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
