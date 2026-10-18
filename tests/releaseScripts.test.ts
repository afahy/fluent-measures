import { execFileSync, spawnSync } from 'node:child_process';
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
  return execFileSync('git', args, { cwd, encoding: 'utf8', env });
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('release scripts', () => {
  // AFA-84: `changeset publish` creates the release tag after it publishes, so a push that runs
  // only before it leaves the tag on the maintainer's machine.
  it('pushes the tag that changeset publish creates', { timeout: 20_000 }, () => {
    const remote = createDirectory('fluent-measures-remote-');
    git(remote, 'init', '--bare', '--initial-branch', 'main');
    const repository = createDirectory('fluent-measures-release-');
    git(repository, 'init', '--initial-branch', 'main');
    git(repository, 'config', 'user.name', 'Release Test');
    git(repository, 'config', 'user.email', 'release-test@example.invalid');
    git(repository, 'commit', '--allow-empty', '-m', 'chore: release');
    git(repository, 'remote', 'add', 'origin', remote);
    git(repository, 'push', '--set-upstream', 'origin', 'main');

    // Stand-ins for the commands that the script runs. `changeset publish` tags a release with
    // `git tag <tag> -m <tag>` (`tag` in @changesets/git), so this one does the same and publishes
    // nothing. The build isn't under test.
    const bin = createDirectory('fluent-measures-release-bin-');
    writeFileSync(resolve(bin, 'changeset'), '#!/bin/sh\ngit tag v9.9.9 -m v9.9.9\n', {
      mode: 0o755,
    });
    writeFileSync(resolve(bin, 'pnpm'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });

    const result = spawnSync('sh', ['-c', scripts['release:publish']], {
      cwd: repository,
      encoding: 'utf8',
      env: { ...env, PATH: `${bin}${delimiter}${env.PATH}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(git(remote, 'tag', '--list')).toBe('v9.9.9\n');
  });
});
