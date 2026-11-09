import { execFileSync, spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { withoutGitRepository } from './gitEnvironment';

const { scripts } = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};
const directories: string[] = [];
const env = withoutGitRepository();

function directory(): string {
  const path = mkdtempSync(resolve(tmpdir(), 'fluent-measures-release-'));
  directories.push(path);
  return path;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

interface Options {
  merged?: boolean;
  ci?: Partial<Record<string, string>> | null;
  fail?: string;
  tag?: 'missing' | 'wrong';
  mergeDuringPublish?: boolean;
  changeDuringCheck?: 'dirty' | 'head';
  publishedVersions?: string[];
  publishedVersion?: string;
}

// No real package manager, GitHub or registry calls. Every Git remote is a temporary local
// bare repo, and all command stand-ins live outside the checkout so cleanliness is meaningful.
function fixture(options: Options = {}): {
  repository: string;
  remote: string;
  revision: string;
  initial: string;
  events: () => string[];
  run: (script?: string, args?: string[]) => SpawnSyncReturns<string>;
} {
  const remote = directory();
  git(remote, 'init', '--bare', '--initial-branch', 'main');
  const repository = directory();
  git(repository, 'init', '--initial-branch', 'main');
  git(repository, 'config', 'user.name', 'Release Test');
  git(repository, 'config', 'user.email', 'release-test@example.invalid');
  git(repository, 'remote', 'add', 'origin', remote);
  git(repository, 'commit', '--allow-empty', '-m', 'chore: start');
  git(repository, 'push', '--set-upstream', 'origin', 'main');
  const initial = git(repository, 'rev-parse', 'HEAD');
  mkdirSync(resolve(repository, '.github/scripts'), { recursive: true });
  // When replaying this test on main, use main's actual shell wrapper with the same stand-ins.
  if (existsSync('.github/scripts/release.mjs')) {
    writeFileSync(
      resolve(repository, '.github/scripts/release.mjs'),
      readFileSync('.github/scripts/release.mjs')
    );
  }
  writeFileSync(
    resolve(repository, 'package.json'),
    JSON.stringify({ name: '@afahy/fluent-measures', version: '9.9.9' })
  );
  git(repository, 'add', '.');
  git(repository, 'commit', '-m', 'chore: release');
  const revision = git(repository, 'rev-parse', 'HEAD');
  if (options.merged !== false) git(repository, 'push', 'origin', 'main');
  // Only the legacy-wrapper regression needs a local branch to expose its unsafe push.
  if (options.merged !== false) git(repository, 'checkout', '--detach', revision);
  const other = directory();
  git(other, 'clone', '--quiet', remote, '.');
  git(other, 'config', 'user.name', 'Other Test');
  git(other, 'config', 'user.email', 'other-test@example.invalid');
  const bin = directory();
  const log = resolve(bin, 'events');
  for (const tool of ['pnpm', 'changeset', 'gh', 'npm']) {
    writeFileSync(
      resolve(bin, tool),
      `#!/usr/bin/env node
const { execFileSync } = require('node:child_process');
const { appendFileSync, writeFileSync } = require('node:fs');
const options = ${JSON.stringify(options)};
const args = process.argv.slice(2);
const tool = ${JSON.stringify(tool)};
const log = ${JSON.stringify(log)};
const revision = ${JSON.stringify(revision)};
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
appendFileSync(log, tool + ' ' + args.join(' ') + '\\n');
const publishing = tool === 'changeset' || (tool === 'pnpm' && args.join(' ') === 'exec changeset publish');
if (options.fail === tool || (tool === 'pnpm' && options.fail === args[0]) || (publishing && options.fail === 'publish')) process.exit(37);
if (tool === 'gh') console.log(JSON.stringify(options.ci === null ? [] : [{ headSha: revision, headBranch: 'main', event: 'push', status: 'completed', conclusion: 'success', url: 'https://example.invalid/ci', ...options.ci }]));
if (tool === 'npm') console.log(JSON.stringify(args[2] === 'versions' ? (options.publishedVersions ?? ['0.2.0']) : (options.publishedVersion ?? '9.9.9')));
if (tool === 'pnpm' && args[0] === 'check') {
  if (options.changeDuringCheck === 'dirty') writeFileSync('unexpected', 'dirty');
  if (options.changeDuringCheck === 'head') git('commit', '--allow-empty', '-m', 'chore: changed');
}
if (publishing) {
  if (options.tag !== 'missing') git('tag', '-a', 'v9.9.9', '-m', 'v9.9.9', options.tag === 'wrong' ? ${JSON.stringify(initial)} : revision);
  if (options.mergeDuringPublish) {
    process.chdir(${JSON.stringify(other)});
    git('pull', '--quiet', 'origin', 'main');
    git('commit', '--allow-empty', '-m', 'chore: another merge');
    git('push', 'origin', 'main');
  }
}
`,
      { mode: 0o755 }
    );
  }
  return {
    repository,
    remote,
    revision,
    initial,
    events: () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []),
    run: (script = 'release:publish', args = ['9.9.9', revision, '--approved']) =>
      spawnSync('sh', ['-c', `${scripts[script]} "$@"`, 'release-test', ...args], {
        cwd: repository,
        encoding: 'utf8',
        env: { ...env, PATH: `${bin}${delimiter}${env.PATH}` },
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
  };
}

function expectNoPublication(test: ReturnType<typeof fixture>): void {
  expect(test.events().join('\n')).not.toMatch(/changeset publish/);
  expect(git(test.remote, 'tag', '--list')).toBe('');
}

function dirty(repository: string, kind: string): void {
  const file = kind === 'untracked' ? 'unexpected' : 'package.json';
  writeFileSync(resolve(repository, file), 'dirty');
  if (kind === 'staged') git(repository, 'add', file);
}

afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { force: true, recursive: true });
});

describe('guarded release commands', () => {
  // AFA-264 explicitly replaces the old wrapper's push of an unmerged release commit.
  it('refuses a release commit that exists only locally without publishing or pushing main', () => {
    const test = fixture({ merged: false });
    const result = test.run();
    expectNoPublication(test);
    expect(git(test.remote, 'rev-parse', 'main')).toBe(test.initial);
    expect(result.status).not.toBe(0);
  });

  it('validates the merged SHA before publishing and pushes its exact tag', () => {
    const test = fixture();
    const result = test.run();
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(test.events()).toEqual([
      `gh run list --repo afahy/fluent-measures --workflow ci.yml --branch main --event push --commit ${test.revision} --limit 1 --json headSha,headBranch,event,status,conclusion,url`,
      'npm view @afahy/fluent-measures versions --json --registry=https://registry.npmjs.org',
      'pnpm clean',
      'pnpm install --frozen-lockfile',
      'pnpm check',
      `gh run list --repo afahy/fluent-measures --workflow ci.yml --branch main --event push --commit ${test.revision} --limit 1 --json headSha,headBranch,event,status,conclusion,url`,
      'npm view @afahy/fluent-measures versions --json --registry=https://registry.npmjs.org',
      'pnpm exec changeset publish',
      'npm view @afahy/fluent-measures@9.9.9 version --json --registry=https://registry.npmjs.org',
    ]);
    expect(git(test.remote, 'tag', '--list')).toBe('v9.9.9');
    expect(git(test.remote, 'rev-parse', 'v9.9.9^{commit}')).toBe(test.revision);
    expect(git(test.remote, 'rev-parse', 'main')).toBe(test.revision);
  });

  it.each(['release', 'release:validate'])('%s only validates; it never publishes', script => {
    const test = fixture();
    const result = test.run(script, ['9.9.9', test.revision]);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(test.events()).toContain('pnpm check');
    expectNoPublication(test);
  });

  it('requires a separate acknowledgement of maintainer approval', () => {
    const test = fixture();
    const result = test.run('release:publish', ['9.9.9', test.revision]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('maintainer approval');
    expectNoPublication(test);
  });

  it.each([
    ['missing inputs', []],
    ['range', ['^9.9.9', 'a'.repeat(40), '--approved']],
    ['prerelease', ['9.9.9-beta.1', 'a'.repeat(40), '--approved']],
    ['leading zero', ['09.9.9', 'a'.repeat(40), '--approved']],
    ['branch', ['9.9.9', 'main', '--approved']],
    ['short SHA', ['9.9.9', 'aaaaaaa', '--approved']],
    ['extra flag', ['9.9.9', 'a'.repeat(40), '--approved', '--force']],
  ])('rejects %s before running commands', (_name, args) => {
    const test = fixture();
    const result = test.run('release:publish', args);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Usage:');
    expect(test.events()).toEqual([]);
  });

  it.each(['untracked', 'tracked', 'staged'])('refuses a %s dirty checkout', kind => {
    const test = fixture();
    dirty(test.repository, kind);
    const result = test.run();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('must be clean');
    expectNoPublication(test);
  });

  it('refuses the wrong recorded SHA', () => {
    const test = fixture();
    const result = test.run('release:publish', ['9.9.9', test.initial, '--approved']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('HEAD must equal');
    expectNoPublication(test);
  });

  it('refuses the wrong recorded version', () => {
    const test = fixture();
    const result = test.run('release:publish', ['9.9.8', test.revision, '--approved']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('must match the release version');
    expectNoPublication(test);
  });

  it.each([
    null,
    { headSha: 'a'.repeat(40) },
    { headBranch: 'feature' },
    { event: 'pull_request' },
    { status: 'in_progress' },
    { conclusion: 'failure' },
  ])('refuses absent or non-successful exact main CI: %j', ci => {
    const test = fixture({ ci });
    const result = test.run();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('exact SHA on main');
    expectNoPublication(test);
  });

  it.each(['gh', 'npm', 'clean', 'install', 'check'])(
    'stops before publication if %s fails',
    fail => {
      const test = fixture({ fail });
      const result = test.run();
      expect(result.status).not.toBe(0);
      expectNoPublication(test);
    }
  );

  it.each(['dirty', 'head'] as const)(
    'rechecks the checkout after validation changes %s',
    changeDuringCheck => {
      const test = fixture({ changeDuringCheck });
      const result = test.run();
      expect(result.status).not.toBe(0);
      expect(test.events()).toContain('pnpm check');
      expectNoPublication(test);
    }
  );

  it('refuses an already published version without trying to publish again', () => {
    const test = fixture({ publishedVersions: ['0.2.0', '9.9.9'] });
    const result = test.run();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('already published');
    expectNoPublication(test);
  });

  it.each(['correct', 'wrong'])('refuses a preexisting %s local release tag', target => {
    const test = fixture();
    git(test.repository, 'tag', 'v9.9.9', target === 'correct' ? test.revision : test.initial);
    const result = test.run();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('already exists locally');
    expectNoPublication(test);
  });

  it('refuses a release tag that exists only on origin', () => {
    const test = fixture();
    git(test.remote, 'tag', 'v9.9.9', test.revision);
    const result = test.run();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('already exists on origin');
    expect(test.events().join('\n')).not.toMatch(/changeset publish/);
    expect(git(test.remote, 'rev-parse', 'v9.9.9')).toBe(test.revision);
  });

  it('leaves annotated and lightweight experiment tags local even with push.followTags enabled', () => {
    const test = fixture();
    git(test.repository, 'tag', '-a', 'annotated-experiment', '-m', 'experiment');
    git(test.repository, 'tag', 'lightweight-experiment');
    git(test.repository, 'config', 'push.followTags', 'true');
    const result = test.run();
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(git(test.remote, 'tag', '--list')).toBe('v9.9.9');
  });

  it('pushes only the approved tag if main advances during publication', () => {
    const test = fixture({ mergeDuringPublish: true });
    const result = test.run();
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(git(test.remote, 'tag', '--list')).toBe('v9.9.9');
    expect(git(test.remote, 'rev-parse', 'v9.9.9^{commit}')).toBe(test.revision);
    expect(git(test.remote, 'rev-parse', 'main')).not.toBe(test.revision);
    expect(git(test.remote, 'rev-parse', 'main^')).toBe(test.revision);
  });

  it('does not rerun the pre-push hook after explicit validation and publication', () => {
    const test = fixture();
    writeFileSync(resolve(test.repository, '.git/hooks/pre-push'), '#!/bin/sh\nexit 1\n', {
      mode: 0o755,
    });
    const result = test.run();
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(test.events()).toContain('pnpm check');
    expect(git(test.remote, 'tag', '--list')).toBe('v9.9.9');
  });

  it.each(['missing', 'wrong'] as const)(
    'fails after publication for a %s tag without pushing it',
    tag => {
      const test = fixture({ tag });
      const result = test.run();
      expect(result.status).not.toBe(0);
      expect(test.events()).toContain('pnpm exec changeset publish');
      expect(result.stderr).toContain('refs/tags/v9.9.9');
      expect(result.stderr).toContain('recovery in RELEASING.md');
      expect(git(test.remote, 'tag', '--list')).toBe('');
    }
  );

  it('propagates a failed publish without pushing a tag', () => {
    const test = fixture({ fail: 'publish' });
    const result = test.run();
    expect(result.status).not.toBe(0);
    expect(test.events()).toContain('pnpm exec changeset publish');
    expect(result.stderr).toContain('npm may already contain');
    expect(git(test.remote, 'tag', '--list')).toBe('');
  });

  it('does not push when npm does not confirm the exact published version', () => {
    const test = fixture({ publishedVersion: '9.9.8' });
    const result = test.run();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('exact version available');
    expect(git(test.remote, 'tag', '--list')).toBe('');
  });

  it('reports tag push failure without republishing', () => {
    const test = fixture();
    writeFileSync(resolve(test.remote, 'hooks/pre-receive'), '#!/bin/sh\nexit 1\n', {
      mode: 0o755,
    });
    const result = test.run();
    expect(result.status).not.toBe(0);
    expect(test.events().filter(event => event === 'pnpm exec changeset publish')).toHaveLength(1);
    expect(result.stderr).toContain('recovery in RELEASING.md');
    expect(git(test.repository, 'rev-parse', 'v9.9.9^{commit}')).toBe(test.revision);
    expect(git(test.remote, 'tag', '--list')).toBe('');
  });
});
