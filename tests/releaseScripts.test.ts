import { execFileSync, spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { delimiter, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { withoutGitRepository } from './gitEnvironment';

const { scripts } = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};
const directories: string[] = [];

// Without the user's git config, a setting such as tag.gpgSign can't change the result.
const env: ReturnType<typeof withoutGitRepository> = {
  ...withoutGitRepository(),
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_NOSYSTEM: '1',
};

function createDirectory(prefix: string): string {
  const directory = mkdtempSync(resolve(tmpdir(), prefix));
  directories.push(directory);
  return directory;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * Runs `release:publish` in a new repository whose `origin` is a local bare repository. The
 * repository has a release commit that `origin` doesn't have yet, as after `changeset version`.
 * Stand-ins for `pnpm` and `changeset` come first on PATH. `changeset publish` tags a release
 * with `git tag <tag> -m <tag>` (`tag` in @changesets/git), so the stand-in does the same and
 * publishes nothing. It fails if `origin` doesn't have HEAD yet, and it writes a `published` file.
 */
function runReleasePublish({ prePushHook }: { prePushHook?: string } = {}): {
  remote: string;
  result: SpawnSyncReturns<string>;
} {
  const remote = createDirectory('fluent-measures-remote-');
  git(remote, 'init', '--bare', '--initial-branch', 'main');
  const repository = createDirectory('fluent-measures-release-');
  git(repository, 'init', '--initial-branch', 'main');
  git(repository, 'config', 'user.name', 'Release Test');
  git(repository, 'config', 'user.email', 'release-test@example.invalid');
  git(repository, 'commit', '--allow-empty', '-m', 'chore: start');
  git(repository, 'remote', 'add', 'origin', remote);
  git(repository, 'push', '--set-upstream', 'origin', 'main');
  git(repository, 'commit', '--allow-empty', '-m', 'chore: release');
  if (prePushHook) {
    writeFileSync(resolve(repository, '.git/hooks/pre-push'), prePushHook, { mode: 0o755 });
  }

  const bin = createDirectory('fluent-measures-release-bin-');
  writeFileSync(
    resolve(bin, 'changeset'),
    [
      '#!/bin/sh',
      '[ "$(git ls-remote origin refs/heads/main | cut -f1)" = "$(git rev-parse HEAD)" ] || exit 1',
      'git tag v9.9.9 -m v9.9.9',
      'touch published',
      '',
    ].join('\n'),
    { mode: 0o755 }
  );
  writeFileSync(resolve(bin, 'pnpm'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });

  const result = spawnSync('sh', ['-c', scripts['release:publish']], {
    cwd: repository,
    encoding: 'utf8',
    env: { ...env, PATH: `${bin}${delimiter}${env.PATH}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { remote, result };
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('release:publish', () => {
  // Changesets tags HEAD after the publish, and it expects HEAD on the remote by then.
  it('pushes the release commit before changeset publish runs', () => {
    const { result } = runReleasePublish();

    expect(result.status, result.stdout + result.stderr).toBe(0);
  });

  // AFA-84: `changeset publish` creates the tag, so a push that runs only before it leaves the
  // tag on the maintainer's machine.
  it('pushes the tag that changeset publish creates', () => {
    const { remote, result } = runReleasePublish();

    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(git(remote, 'tag', '--list')).toBe('v9.9.9\n');
  });

  // The pre-push hook runs the tests, the build and the size check. The first push ran it on the
  // same commit. If it ran again and failed after the publish, the tag would stay local.
  it('pushes the tag when the pre-push hook would fail after the publish', () => {
    const { remote, result } = runReleasePublish({
      prePushHook: '#!/bin/sh\n[ ! -e published ]\n',
    });

    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(git(remote, 'tag', '--list')).toBe('v9.9.9\n');
  });
});
