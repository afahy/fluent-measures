// Single-package release guard. Approval is a maintainer decision recorded outside this CLI;
// --approved only acknowledges it. See RELEASING.md before running the publish command.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { verifyPackage } from './docs-release.mjs';

const packageName = '@afahy/fluent-measures';
const repository = 'afahy/fluent-measures';
const registry = 'https://registry.npmjs.org';
const [mode, version, revision, approval, expectedIntegrity, ...extra] = process.argv.slice(2);

function capture(tool, args) {
  return execFileSync(tool, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();
}

function run(tool, args, options = {}) {
  execFileSync(tool, args, { ...options, stdio: 'inherit' });
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

function integrityOf(bytes) {
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
}

function prepareArtifact(directory, staging) {
  run('pnpm', ['clean']);
  run('pnpm', ['install', '--frozen-lockfile']);
  run('pnpm', ['check']);
  const candidate = join(staging, 'candidate');
  mkdirSync(candidate);
  const tarball = join(candidate, 'package.tgz');
  // pnpm preserves the consumer manifest transformation used by normal packs. The verified
  // dist is already built; do not let prepack remove and rebuild it.
  run('pnpm', ['--config.ignore-scripts=true', 'pack', '--out', tarball]);
  const integrity = integrityOf(readFileSync(tarball));
  const consumer = join(staging, 'consumer');
  mkdirSync(consumer);
  writeFileSync(join(consumer, 'package.json'), '{"private":true}');
  run(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=true',
      `--registry=${registry}`,
      tarball,
    ],
    { cwd: consumer }
  );
  const installed = join(consumer, 'node_modules', packageName);
  const lock = JSON.parse(readFileSync(join(consumer, 'package-lock.json'), 'utf8'));
  assert.equal(
    lock.packages[`node_modules/${packageName}`].integrity,
    integrity,
    'Installed tarball integrity mismatch'
  );
  verifyPackage(
    process.cwd(),
    installed,
    version,
    { name: packageName, version, dist: { integrity } },
    revision
  );
  run('pnpm', ['test:package'], { env: { ...process.env, FLUENT_MEASURES_PACKAGE_DIR: consumer } });
  checkout();

  const record = { name: packageName, version, revision, integrity };
  writeFileSync(join(candidate, 'validated.json'), JSON.stringify(record));
  retainArtifact(candidate, directory, integrity);
  console.log(
    `Validated ${packageName}@${version} from ${revision}. Tarball integrity: ${integrity}`
  );
}

function retainArtifact(candidate, directory, integrity) {
  // Promote both files together. A second validation in this checkout may confirm the
  // same bytes, but cannot replace an archive already recorded for approval.
  try {
    renameSync(candidate, directory);
  } catch (error) {
    if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error;
    assert.equal(
      readValidatedArtifact(directory).integrity,
      integrity,
      'Another tarball was already validated here; use a fresh release clone'
    );
  }
}

function readValidatedArtifact(directory) {
  const record = JSON.parse(readFileSync(join(directory, 'validated.json'), 'utf8'));
  const bytes = readFileSync(join(directory, 'package.tgz'));
  const integrity = integrityOf(bytes);
  assert.deepEqual(
    record,
    { name: packageName, version, revision, integrity },
    'Tarball does not match its validation record'
  );
  return { bytes, integrity };
}

// The workflow runs on completed CI. Its own head SHA can be newer than the CI
// commit. The workflow checks out the triggering SHA and names its artifact after it.
function fetchCandidate(runId, directory, staging) {
  const candidateRun = JSON.parse(
    capture('gh', ['api', `repos/${repository}/actions/runs/${runId}`])
  );
  assert.ok(
    candidateRun.path === '.github/workflows/release-candidate.yml' &&
      candidateRun.event === 'workflow_run' &&
      candidateRun.head_branch === 'main' &&
      candidateRun.status === 'completed' &&
      candidateRun.conclusion === 'success',
    'Select a successful Prepare release candidate run on main'
  );
  const candidate = join(staging, 'candidate');
  run('gh', [
    'run',
    'download',
    runId,
    '--repo',
    repository,
    '--name',
    `release-${revision}`,
    '--dir',
    candidate,
  ]);
  const { integrity } = readValidatedArtifact(candidate);
  assert.equal(integrity, expectedIntegrity, 'Downloaded tarball differs from the release summary');
  retainArtifact(candidate, directory, integrity);
  console.log(
    `Ready for maintainer approval: ${packageName}@${version} from ${revision}, ${integrity}`
  );
}

async function waitForRegistry(integrity) {
  // npm accepts the upload before all reads can see it. Retry only exact-version
  // reads reporting E404. Bound each read as well as the backoff.
  const deadline = Date.now() + 5 * 60_000;
  let wait = 1_000;
  while (Date.now() < deadline) {
    const lookup = spawnSync(
      'npm',
      [
        'view',
        `${packageName}@${version}`,
        'version',
        'dist.integrity',
        '--json',
        '--prefer-online',
        `--registry=${registry}`,
      ],
      {
        encoding: 'utf8',
        timeout: Math.min(20_000, Math.max(1, deadline - Date.now())),
        env: { ...process.env, npm_config_fetch_retries: '0' },
      }
    );
    if (lookup.error) throw lookup.error;
    if (lookup.status === 0) {
      const published = JSON.parse(lookup.stdout);
      assert.equal(
        published.version,
        version,
        'Publication did not make the exact version available on npm'
      );
      assert.equal(published['dist.integrity'], integrity, 'Published tarball integrity mismatch');
      return;
    }
    if (!/\bE404\b/.test(lookup.stderr + lookup.stdout)) {
      throw new Error(`Registry lookup failed: ${lookup.stderr || lookup.stdout}`);
    }
    console.log(`Waiting for npm to serve ${packageName}@${version}.`);
    await delay(Math.min(wait, Math.max(0, deadline - Date.now())));
    wait = Math.min(2 * wait, 15_000);
  }
  throw new Error(
    'Timed out waiting for the published version. Use release:resume with the recorded digest.'
  );
}

function finishTag() {
  const local = capture('git', ['tag', '--list', `v${version}`]);
  if (local)
    assert.equal(capture('git', ['rev-parse', `${tag}^{commit}`]), revision, 'Local tag mismatch');
  const remote = capture('git', ['ls-remote', 'origin', tag, `${tag}^{}`]);
  if (remote) {
    const refs = new Map(remote.split('\n').map(line => line.split('\t').reverse()));
    assert.equal(refs.get(`${tag}^{}`) ?? refs.get(tag), revision, 'Remote tag mismatch');
    return;
  }
  if (!local) run('git', ['tag', '-a', `v${version}`, '-m', `v${version}`, revision]);
  assert.equal(
    capture('git', ['rev-parse', '--verify', `${tag}^{commit}`]),
    revision,
    `${tag} must exist and resolve to the approved SHA`
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
}

let staging;
let publicationStarted = false;
try {
  const validDigest = /^sha512-[A-Za-z0-9+/]{86}==$/.test(expectedIntegrity ?? '');
  const argumentsValid = {
    validate: approval === undefined && expectedIntegrity === undefined,
    fetch: /^[1-9]\d*$/.test(approval ?? '') && validDigest,
    publish: approval === '--approved' && (expectedIntegrity === undefined || validDigest),
    resume: approval === '--approved' && validDigest,
  };
  assert.ok(
    Object.hasOwn(argumentsValid, mode) &&
      argumentsValid[mode] &&
      /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version ?? '') &&
      /^[a-f0-9]{40}$/.test(revision ?? '') &&
      extra.length === 0,
    'Usage: release:validate VERSION SHA | release:fetch VERSION SHA RUN_ID DIGEST | release:publish VERSION SHA --approved [DIGEST] | release:resume VERSION SHA --approved DIGEST (maintainer approval required)'
  );
  if (mode === 'publish') {
    assert.ok(
      process.stdin.isTTY && process.stdout.isTTY && process.stderr.isTTY,
      'npm authentication needs an interactive terminal with stdin, stdout and stderr attached'
    );
  }
  checkout();
  merged();
  successfulCI();
  if (mode === 'validate' || mode === 'publish') unpublished();
  const root = join(capture('git', ['rev-parse', '--absolute-git-dir']), 'release-artifacts');
  const directory = join(root, revision);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  staging = mkdtempSync(join(root, 'stage-'));
  if (mode === 'validate') {
    prepareArtifact(directory, staging);
  } else if (mode === 'fetch') {
    fetchCandidate(approval, directory, staging);
  } else {
    const { bytes, integrity } = readValidatedArtifact(directory);
    if (expectedIntegrity !== undefined) {
      assert.equal(
        integrity,
        expectedIntegrity,
        'Tarball differs from the digest on the release ticket'
      );
    }
    if (mode === 'publish') {
      const tarball = join(staging, 'package.tgz');
      writeFileSync(tarball, bytes, { mode: 0o400 });
      publicationStarted = true;
      run(
        'npm',
        [
          'publish',
          tarball,
          '--ignore-scripts',
          '--access=public',
          '--tag=latest',
          `--registry=${registry}`,
        ],
        {
          env: {
            ...(process.platform === 'darwin' ? { npm_config_browser: 'Google Chrome' } : {}),
            ...process.env,
          },
        }
      );
    }
    await waitForRegistry(integrity);
    if (mode === 'resume') {
      // Verify the registry archive itself before finishing a partially completed release.
      run('npm', [
        'pack',
        `${packageName}@${version}`,
        '--ignore-scripts',
        '--prefer-online',
        `--registry=${registry}`,
        '--pack-destination',
        staging,
      ]);
      const registryTarball = join(staging, `afahy-fluent-measures-${version}.tgz`);
      assert.equal(
        integrityOf(readFileSync(registryTarball)),
        integrity,
        'Downloaded npm tarball integrity mismatch'
      );
    }
    checkout();
    finishTag();
    console.log(
      `Verified ${packageName}@${version} from ${revision} and ${tag}. Verify documentation using RELEASING.md.`
    );
  }
} catch (error) {
  console.error(error.message);
  if (publicationStarted) {
    console.error(
      'npm may already contain this version. Use release:resume to verify and finish tagging. See recovery in RELEASING.md.'
    );
  }
  process.exitCode = 1;
} finally {
  if (staging) rmSync(staging, { recursive: true, force: true });
}
