// The archive is a durable, append-only version ledger, not an expiring Actions artifact.
// The workflow serializes this entire operation through deployment (including job reruns).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { command, fileList, releaseVersion, site } from './docs-release.mjs';
import { readDocsArtifact } from './docs-verify-public.mjs';

export function digests(directory) {
  return Object.fromEntries(
    fileList(directory).map(file => [
      file,
      createHash('sha256')
        .update(readFileSync(join(directory, file)))
        .digest('hex'),
    ])
  );
}

function compareVersions(left, right) {
  const a = releaseVersion(left).split('.').map(BigInt);
  const b = releaseVersion(right).split('.').map(BigInt);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  return 0;
}

// Only the root aliases have the site's canonical URL. Archived pages have their own URL.
function rootHtml(html, version) {
  const base = `${site}versions/${version}/`;
  return html
    .replace(`rel="canonical" href="${base}"`, `rel="canonical" href="${site}"`)
    .replace(`property="og:url" content="${base}"`, `property="og:url" content="${site}"`);
}

export function validateArchive(directory) {
  const index = JSON.parse(readFileSync(join(directory, 'versions.json'), 'utf8'));
  releaseVersion(index.current);
  assert.ok(index.releases[index.current], 'Archive current version is missing');
  for (const [version, entry] of Object.entries(index.releases)) {
    releaseVersion(version);
    assert.ok(compareVersions(index.current, version) >= 0, 'Archive current version is stale');
    const path = join(directory, 'versions', version);
    assert.deepEqual(digests(path), entry.files, `Archived ${version} content changed`);
    const artifact = readDocsArtifact(path);
    assert.equal(artifact.version, version);
    assert.equal(artifact.revision, entry.revision);
    const binding = JSON.parse(readFileSync(join(path, 'release.json'), 'utf8'));
    const { files: _files, ...recorded } = entry;
    assert.deepEqual(binding, recorded, 'Archived release binding changed');
  }
  const current = join(directory, 'versions', index.current);
  for (const file of fileList(current)) {
    const expected =
      file === 'index.html'
        ? Buffer.from(rootHtml(readFileSync(join(current, file), 'utf8'), index.current))
        : readFileSync(join(current, file));
    assert.ok(
      readFileSync(join(directory, file)).equals(expected),
      `Root ${file} differs from selected release`
    );
  }
  readDocsArtifact(directory);
  return index;
}

export function preparePromotion(candidate, previous, output) {
  const artifact = readDocsArtifact(candidate);
  const version = releaseVersion(artifact.version);
  const binding = JSON.parse(readFileSync(join(candidate, 'release.json'), 'utf8'));
  assert.equal(
    binding.verification,
    'reproduced-package-and-release-examples',
    'Unverified documentation candidate'
  );
  const index = previous ? validateArchive(previous) : { current: version, releases: {} };
  assert.ok(
    compareVersions(version, index.current) >= 0,
    `Refusing to replace ${index.current} with older ${version}`
  );
  const files = digests(candidate);
  if (index.releases[version]) {
    assert.deepEqual(
      index.releases[version].files,
      files,
      `Version ${version} is immutable; use its retained artifact`
    );
  }
  // Validate everything before touching the new output, let alone the durable archive.
  assert.notEqual(resolve(output), resolve(candidate));
  if (previous) assert.notEqual(resolve(output), resolve(previous));
  rmSync(output, { recursive: true, force: true });
  mkdirSync(join(output, 'versions'), { recursive: true });
  if (previous) cpSync(join(previous, 'versions'), join(output, 'versions'), { recursive: true });
  cpSync(candidate, join(output, 'versions', version), { recursive: true });
  cpSync(candidate, output, { recursive: true });
  writeFileSync(
    join(output, 'index.html'),
    rootHtml(readFileSync(join(candidate, 'index.html'), 'utf8'), version)
  );
  index.current = version;
  index.releases[version] = { ...binding, files };
  writeFileSync(join(output, 'versions.json'), JSON.stringify(index, null, 2) + '\n');
  validateArchive(output);
  return index;
}

export function promoteDocs(
  candidate,
  output,
  { repository = process.cwd(), remote = 'origin', run = command } = {}
) {
  const ref = 'refs/heads/verified-docs';
  const temp = mkdtempSync(join(tmpdir(), 'fm-docs-archive-'));
  try {
    const remoteHead = run('git', ['ls-remote', '--heads', remote, ref], { cwd: repository }).split(
      /\s/
    )[0];
    let previous;
    if (remoteHead) {
      run('git', ['fetch', '--no-tags', remote, ref], { cwd: repository });
      const fetched = run('git', ['rev-parse', 'FETCH_HEAD'], { cwd: repository });
      assert.equal(fetched, remoteHead, 'Docs archive changed while reading it; retry');
      previous = join(temp, 'previous');
      mkdirSync(previous);
      run('git', ['archive', '--format=tar', `--output=${join(temp, 'archive.tar')}`, fetched], {
        cwd: repository,
      });
      run('tar', ['-xf', join(temp, 'archive.tar'), '-C', previous]);
    }
    preparePromotion(candidate, previous, output);
    // A separate temporary index writes only generated docs; no worktree or source edits.
    const env = { ...process.env, GIT_INDEX_FILE: join(temp, 'index') };
    run('git', ['--work-tree', resolve(output), 'add', '--all', '--', '.'], {
      cwd: repository,
      env,
    });
    const tree = run('git', ['write-tree'], { cwd: repository, env });
    if (
      remoteHead &&
      tree === run('git', ['rev-parse', `${remoteHead}^{tree}`], { cwd: repository })
    )
      return;
    const args = [
      'commit-tree',
      tree,
      ...(remoteHead ? ['-p', remoteHead] : []),
      '-m',
      `docs: verify npm ${readDocsArtifact(candidate).version}`,
    ];
    const sha = run('git', args, {
      cwd: repository,
      env: {
        ...env,
        GIT_AUTHOR_NAME: 'github-actions[bot]',
        GIT_COMMITTER_NAME: 'github-actions[bot]',
        GIT_AUTHOR_EMAIL: '41898282+github-actions[bot]@users.noreply.github.com',
        GIT_COMMITTER_EMAIL: '41898282+github-actions[bot]@users.noreply.github.com',
      },
    });
    // Fast-forward only. A concurrent writer fails here, before upload/deploy; never force-push.
    run('git', ['push', remote, `${sha}:${ref}`], { cwd: repository });
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const output = resolve(process.argv[3] ?? 'build/docs');
  mkdirSync(dirname(output), { recursive: true });
  promoteDocs(resolve(process.argv[2] ?? 'build/verified-release'), output);
}
