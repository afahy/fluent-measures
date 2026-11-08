// Single-package release guard. Approval is a maintainer decision recorded outside this CLI;
// --approved only acknowledges it. See RELEASING.md before running the publish command.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const packageName = '@afahy/fluent-measures';
const repository = 'afahy/fluent-measures';
const registry = 'https://registry.npmjs.org';
const [mode, version, revision, approval, ...extra] = process.argv.slice(2);

function capture(tool, args) {
  return execFileSync(tool, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();
}

function run(tool, args) {
  execFileSync(tool, args, { stdio: 'inherit' });
}

function checkout() {
  assert.equal(capture('git', ['rev-parse', 'HEAD']), revision, 'HEAD must equal the release SHA');
  assert.equal(
    capture('git', ['status', '--porcelain', '--untracked-files=all']),
    '',
    'Release checkout must be clean (including untracked files)'
  );
  const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(manifest.name, packageName, 'Unexpected release package');
  assert.equal(manifest.version, version, 'package.json must match the release version');
}

function merged() {
  // Fetch only main; do not import tags or depend on a stale remote-tracking branch.
  run('git', ['fetch', '--no-tags', 'origin', 'refs/heads/main:refs/remotes/origin/main']);
  run('git', ['merge-base', '--is-ancestor', revision, 'refs/remotes/origin/main']);
}

function successfulCI() {
  const [latest] = JSON.parse(
    capture('gh', [
      'run',
      'list',
      '--repo',
      repository,
      '--workflow',
      'ci.yml',
      '--branch',
      'main',
      '--event',
      'push',
      '--commit',
      revision,
      '--limit',
      '1',
      '--json',
      'headSha,headBranch,event,status,conclusion,url',
    ])
  );
  assert.ok(
    latest?.headSha === revision &&
      latest.headBranch === 'main' &&
      latest.event === 'push' &&
      latest.status === 'completed' &&
      latest.conclusion === 'success',
    'The latest CI run for this exact SHA on main must have completed successfully'
  );
  console.log(`Verified main CI: ${latest.url}`);
}

const tag = `refs/tags/v${version}`;
function unpublished() {
  assert.equal(
    capture('git', ['tag', '--list', `v${version}`]),
    '',
    `${tag} already exists locally`
  );
  assert.equal(capture('git', ['ls-remote', 'origin', tag]), '', `${tag} already exists on origin`);
  // A registry/network failure is not evidence of an unpublished version. This package already
  // exists, so querying its version list avoids interpreting a failed exact-version lookup.
  const versions = JSON.parse(
    capture('npm', ['view', packageName, 'versions', '--json', `--registry=${registry}`])
  );
  assert.ok(Array.isArray(versions), 'Expected the npm version list');
  assert.ok(
    !versions.includes(version),
    'Version is already published; use recovery in RELEASING.md'
  );
}

let publicationStarted = false;
try {
  assert.ok(
    ['validate', 'publish'].includes(mode) &&
      /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version ?? '') &&
      /^[a-f0-9]{40}$/.test(revision ?? '') &&
      extra.length === 0 &&
      (mode === 'publish' ? approval === '--approved' : approval === undefined),
    'Usage: pnpm release:validate <version> <full-sha> OR pnpm release:publish <version> <full-sha> --approved (only after maintainer approval; RELEASING.md)'
  );
  checkout();
  merged();
  successfulCI();
  unpublished();
  // Replace the former branch push/pre-push validation with explicit, stronger validation.
  // Rebuild from scratch and retain package, API, size, coverage and mutation checks.
  run('pnpm', ['clean']);
  run('pnpm', ['install', '--frozen-lockfile']);
  run('pnpm', ['check']);
  checkout();
  if (mode === 'publish') {
    // Validation can take time. Recheck the source, CI and publication state before npm.
    merged();
    successfulCI();
    unpublished();
    publicationStarted = true;
    run('pnpm', ['exec', 'changeset', 'publish']);
    checkout();
    assert.equal(
      JSON.parse(
        capture('npm', [
          'view',
          `${packageName}@${version}`,
          'version',
          '--json',
          `--registry=${registry}`,
        ])
      ),
      version,
      'Publication did not make the exact version available on npm'
    );
    // Changesets can exit successfully even when tag creation failed. Never push a tag that
    // resolves to anything other than the approved commit, and never push a branch here.
    assert.equal(
      capture('git', ['rev-parse', '--verify', `${tag}^{commit}`]),
      revision,
      `${tag} must point at the release SHA`
    );
    run('git', [
      '-c',
      'push.followTags=false',
      'push',
      '--no-follow-tags',
      '--no-verify',
      'origin',
      `${tag}:${tag}`,
    ]);
    console.log(
      `Published ${packageName}@${version} from ${revision} and pushed only ${tag}. Verify documentation using RELEASING.md.`
    );
  } else {
    console.log(
      `Validated ${packageName}@${version} from ${revision}. Publication still requires explicit maintainer approval.`
    );
  }
} catch (error) {
  console.error(error.message);
  if (publicationStarted) {
    console.error(
      'npm may already contain this version. Do not repeat publication blindly or move a tag. Follow recovery in RELEASING.md.'
    );
  }
  process.exitCode = 1;
}
