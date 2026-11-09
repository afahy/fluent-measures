// Verify a published package against a reproducible release build before making any Pages files.
// No publish command belongs here. The network/command boundary is injectable for offline tests.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { publishLinks } from './docs-build.mjs';
import { readDocsArtifact } from './docs-verify-public.mjs';

export const site = 'https://afahy.github.io/fluent-measures/';
export const packageName = '@afahy/fluent-measures';
const repositoryUrl = 'https://github.com/afahy/fluent-measures';
const root = fileURLToPath(new URL('../../', import.meta.url));
const registry = 'https://registry.npmjs.org';
const references = ['README.md', 'PARSING.md'];
export const documents = ['index.html', ...references, 'llms.txt'];

export function releaseVersion(version) {
  // Stable releases only. No dist-tags, ranges, shell syntax, paths, or ambiguous leading zeros.
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version ?? '')) {
    throw new Error('Select an exact stable npm version (for example 0.2.0)');
  }
  return version;
}

export function command(tool, args, options = {}) {
  const result = execFileSync(tool, args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
    ...options,
  }).trim();
  if (tool === 'pnpm') console.log(result);
  return result;
}

export function fileList(directory) {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => join(entry.parentPath, entry.name).slice(directory.length + 1))
    .sort();
}

// pnpm removes development-only metadata and lifecycle hooks when packing. Compare every
// remaining field, including exports and dependencies, and every published file byte-for-byte.
export function verifyPackage(source, installed, version, metadata, revision) {
  releaseVersion(version);
  const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
  const published = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'));
  for (const candidate of [manifest, published, metadata]) {
    assert.equal(candidate.name, packageName, 'Release package name mismatch');
    assert.equal(candidate.version, version, 'Release package version mismatch');
  }
  if (metadata.gitHead) assert.equal(metadata.gitHead, revision, 'npm gitHead mismatch');
  assert.match(
    metadata.dist?.integrity ?? '',
    /^sha512-[A-Za-z0-9+/]+={0,2}$/,
    'Missing npm integrity'
  );
  delete manifest.pnpm;
  delete manifest.packageManager;
  for (const hook of ['prepare', 'prepack', 'prepublishOnly']) delete manifest.scripts?.[hook];
  assert.deepEqual(published, manifest, 'Published package metadata differs from the release');
  const files = [
    'LICENSE',
    'README.md',
    'package.json',
    ...fileList(join(source, 'dist')).map(file => `dist/${file}`),
  ].sort();
  assert.deepEqual(fileList(installed), files, 'Published file set differs from the release build');
  for (const file of files.filter(file => file !== 'package.json')) {
    assert.ok(
      readFileSync(join(source, file)).equals(readFileSync(join(installed, file))),
      `Published ${file} differs from the release build`
    );
  }
  for (const file of [
    'docs/index.html',
    ...references,
    'tests/readme.test.ts',
    'tests/docsExamples.test.ts',
  ]) {
    assert.ok(existsSync(join(source, file)), `Release is missing ${file}`);
  }
}

export function releaseGuidance(version) {
  return `## Documentation for your version

These documents describe **${packageName}@${version}**. The [stable site](${site}) identifies its documented release; npm can have a newer release while documentation is being verified.

Find your installed version with \`npm ls ${packageName}\` (or \`pnpm list\` / \`yarn why\`). Use the matching entry in the [verified versions](${site}versions.json). Only complete verified sets are listed. Each version's URLs retain their content across later deployments.

Older tags v0.1.0 and v0.1.1 have no PARSING.md and have package metadata mismatches; use the README shipped with those packages. A missing verified version is not permission to use main's specification for that package.
`;
}

export function buildReleaseDocs(source, output, binding) {
  const { version, revision } = binding;
  releaseVersion(version);
  assert.match(revision, /^[a-f0-9]{40}$/);
  const base = `${site}versions/${version}/`;
  const sourceUrl = `${repositoryUrl}/tree/${revision}`;
  const metadata = `Documented package: **${packageName}@${version}**.\nSource revision: [${revision}](${sourceUrl}).`;
  let page = readFileSync(join(source, 'docs/index.html'), 'utf8');
  const marker = /<!-- docs-source -->[\s\S]*?<!-- \/docs-source -->/g;
  assert.equal(page.match(marker)?.length, 1, 'Release page needs one source marker');
  page = page
    .replace(
      /Docs track <code>main<\/code> and may include changes not yet released on npm\. Source:\s*/,
      `Documentation for <code>${packageName}@${version}</code>. Source: `
    )
    .replace(marker, `<a href="${sourceUrl}">${revision.slice(0, 7)}</a>`)
    .replace(
      '<span class="nowrap">@afahy/fluent-measures</span>',
      `<span class="nowrap">${packageName}@${version}</span>`
    )
    .replace(
      '</head>',
      `<meta name="docs-source-revision" content="${revision}" />\n<meta name="docs-package-version" content="${version}" />
<style data-release-layout>
/* Exact-version install commands wrap visually, without changing the copied shell command. */
.code pre:has(.code-cmd) { white-space: pre-wrap; overflow-wrap: anywhere; }
.install-pill code, .install-pill .nowrap { white-space: normal; overflow-wrap: anywhere; }
</style>\n</head>`
    )
    .replaceAll(`${repositoryUrl}/blob/main/`, `${repositoryUrl}/blob/${revision}/`)
    .replaceAll(`${repositoryUrl}/blob/${revision}/PARSING.md`, `${base}PARSING.md`)
    .replaceAll(`${repositoryUrl}/blob/${revision}/README.md`, `${base}README.md`)
    .replace(/href="(README\.md(?:#[^"]*)?|PARSING\.md(?:#[^"]*)?|llms\.txt)"/g, `href="${base}$1"`)
    .replace(`rel="canonical" href="${site}"`, `rel="canonical" href="${base}"`)
    .replace(`property="og:url" content="${site}"`, `property="og:url" content="${base}"`)
    .replaceAll(`content="${site}og.png"`, `content="${base}og.png"`)
    // Installation must select the documented version, even if npm's latest has moved on.
    .replace(
      /((?:npm install|pnpm add|yarn add) @afahy\/fluent-measures)(?![\w@-])/g,
      `$1@${version}`
    );
  // The npm badge still labels the latest registry version separately from the documented one.
  mkdirSync(output, { recursive: true });
  cpSync(join(source, 'docs'), output, { recursive: true });
  writeFileSync(join(output, 'index.html'), page);
  for (const file of references) {
    let markdown = readFileSync(join(source, file), 'utf8');
    if (file === 'README.md') {
      markdown = markdown.replace(/\n## Documentation for your version\n[\s\S]*?(?=\n## |$)/, '\n');
      markdown = markdown.replace(
        /((?:npm install|pnpm add|yarn add) @afahy\/fluent-measures)(?![\w@-])/g,
        `$1@${version}`
      );
    }
    markdown = publishLinks(markdown, revision, base)
      .replaceAll(`](${site})`, `](${base})`)
      .replaceAll(`](${site}README.md`, `](${base}README.md`)
      .replaceAll(`](${site}PARSING.md`, `](${base}PARSING.md`)
      .replaceAll(`](${site}llms.txt)`, `](${base}llms.txt)`);
    const discovery = `[Documentation](${base}) · [Markdown reference](${base}README.md) · [Parsing rules](${base}PARSING.md) · [Agent index (llms.txt)](${base}llms.txt)`;
    markdown = markdown.replace(/^(# .+\n)/, `$1\n${metadata}\n\n${discovery}\n`);
    if (file === 'README.md') markdown += `\n${releaseGuidance(version)}`;
    writeFileSync(join(output, file), markdown);
  }
  writeFileSync(
    join(output, 'llms.txt'),
    `# fluent-measures

> Documentation for the verified npm package ${packageName}@${version}.

${metadata}

## Documentation

- [HTML](${base}): Usage and API reference.
- [README](${base}README.md): Installation, API reference, supported units and troubleshooting.
- [Parsing rules](${base}PARSING.md): The release's parsing specification and examples.

${releaseGuidance(version)}
`
  );
  writeFileSync(join(output, 'release.json'), JSON.stringify(binding, null, 2) + '\n');
  // This validates local content/links before any archive mutation or deployment.
  readDocsArtifact(output);
}

export function verifyRelease(
  version,
  { repository = root, output = join(repository, 'build/verified-release'), run = command } = {}
) {
  releaseVersion(version);
  const revision = run('git', ['rev-parse', '--verify', `refs/tags/v${version}^{commit}`], {
    cwd: repository,
  });
  assert.match(revision, /^[a-f0-9]{40}$/, 'Invalid release revision');
  run('git', ['merge-base', '--is-ancestor', revision, 'origin/main'], { cwd: repository });
  const metadata = JSON.parse(
    run('npm', ['view', `${packageName}@${version}`, '--json', `--registry=${registry}`])
  );
  assert.equal(metadata.version, version, 'Selected version is not published');
  const temp = mkdtempSync(join(tmpdir(), 'fm-docs-release-'));
  try {
    const source = join(temp, 'source');
    const consumer = join(temp, 'consumer');
    mkdirSync(source);
    mkdirSync(consumer);
    run('git', ['archive', '--format=tar', `--output=${join(temp, 'source.tar')}`, revision], {
      cwd: repository,
    });
    run('tar', ['-xf', join(temp, 'source.tar'), '-C', source]);
    const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
    assert.equal(manifest.name, packageName, 'Tag package name mismatch');
    assert.equal(manifest.version, version, 'Tag package version mismatch');
    // Never run publication or lifecycle hooks from the release. Build with its frozen lockfile.
    run('pnpm', ['install', '--frozen-lockfile', '--ignore-scripts'], { cwd: source });
    run('pnpm', ['build'], { cwd: source });
    writeFileSync(join(consumer, 'package.json'), '{"private":true}');
    run(
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--save-exact',
        `--registry=${registry}`,
        `${packageName}@${version}`,
      ],
      { cwd: consumer }
    );
    const installed = join(consumer, 'node_modules', packageName);
    const lock = JSON.parse(readFileSync(join(consumer, 'package-lock.json'), 'utf8'));
    assert.equal(
      lock.packages[`node_modules/${packageName}`].integrity,
      metadata.dist?.integrity,
      'Installed tarball integrity mismatch'
    );
    verifyPackage(source, installed, version, metadata, revision);
    const env = { ...process.env, FLUENT_MEASURES_PACKAGE_DIR: consumer };
    // Reuse the registry-example machinery, with the RELEASE tests/specification, in ESM + CJS.
    run('pnpm', ['test:package', 'tests/readme.test.ts', 'tests/docsExamples.test.ts'], {
      cwd: source,
      env,
    });
    if (version === '0.2.0') {
      assert.equal(revision, 'c37308d0586332f593aec6df4704d11475e59a42', 'Migration tag changed');
      run(
        'git',
        [
          'apply',
          '--unidiff-zero',
          '--check',
          join(repository, '.github/docs-release/0.2.0.patch'),
        ],
        {
          cwd: source,
        }
      );
      run(
        'git',
        ['apply', '--unidiff-zero', join(repository, '.github/docs-release/0.2.0.patch')],
        { cwd: source }
      );
    }
    const binding = {
      version,
      revision,
      integrity: metadata.dist.integrity,
      verification: 'reproduced-package-and-release-examples',
    };
    const candidate = join(temp, 'candidate');
    buildReleaseDocs(source, candidate, binding);
    // Keep expectations release-owned even if main adds unreleased examples later. The legacy
    // presentation migration includes its extra compact-row checks. Test the rendered page.
    cpSync(join(candidate, 'index.html'), join(source, 'docs/index.html'));
    run('pnpm', ['test:package', 'tests/docsExamples.test.ts'], {
      cwd: source,
      env,
    });
    // Publish the local candidate only after all checks succeed; a failure keeps prior output.
    rmSync(output, { recursive: true, force: true });
    cpSync(candidate, output, { recursive: true });
    console.log(`Verified ${packageName}@${version}, source ${revision}, ${binding.integrity}`);
    return output;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  verifyRelease(process.argv[2]);
}
