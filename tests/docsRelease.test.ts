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
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildReleaseDocs,
  releaseVersion,
  verifyRelease,
  type ReleaseBinding,
  type Run,
} from '../.github/scripts/docs-release.mjs';
import {
  preparePromotion,
  promoteDocs,
  validateArchive,
} from '../.github/scripts/docs-promote.mjs';
import { readDocsArtifact, verifyPublicDocs } from '../.github/scripts/docs-verify-public.mjs';
import { git, withoutGitRepository } from './gitEnvironment';
import { execFileSync } from 'node:child_process';

const directories: string[] = [];
const revision = '1234567890abcdef1234567890abcdef12345678';
const integrity = 'sha512-' + Buffer.alloc(64, 7).toString('base64');
const site = 'https://afahy.github.io/fluent-measures/';
const read = (path: string): string => readFileSync(path, 'utf8');
// The ticket requires byte preservation. Read raw files independently of the production
// digest/manifest code so a broken hash function cannot make the retention assertions pass.
function snapshot(path: string): Record<string, Buffer> {
  return Object.fromEntries(
    readdirSync(path, { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => [
        join(entry.parentPath, entry.name).slice(path.length + 1),
        readFileSync(join(entry.parentPath, entry.name)),
      ])
  );
}

function directory(): string {
  const path = mkdtempSync(join(tmpdir(), 'fm-verified-docs-'));
  directories.push(path);
  return path;
}
afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});
function binding(version = '1.2.3'): ReleaseBinding {
  return { version, revision, integrity, verification: 'reproduced-package-and-release-examples' };
}
function sourceFixture(path: string, version = '1.2.3'): void {
  mkdirSync(path, { recursive: true });
  cpSync('docs', join(path, 'docs'), { recursive: true });
  mkdirSync(join(path, 'tests'));
  mkdirSync(join(path, 'dist'));
  writeFileSync(
    join(path, 'package.json'),
    JSON.stringify({ name: '@afahy/fluent-measures', version, exports: './dist/index.js' })
  );
  writeFileSync(join(path, 'dist/index.js'), 'export const release = 123;');
  writeFileSync(join(path, 'LICENSE'), 'MIT fixture');
  writeFileSync(
    join(path, 'README.md'),
    '# fluent-measures\n\nRelease-only text.\n\n```js\nparseMeasurement("6 ft"); // { value: 6, unit: "ft" }\n```\n\n[Rules](PARSING.md#ranges)\n[Source](src/index.ts)\n'
  );
  writeFileSync(
    join(path, 'PARSING.md'),
    '# Parsing rules\n\n## Ranges\n\nRelease rules.\n\n## Units Before a Number\n\n[README](https://github.com/afahy/fluent-measures/blob/main/README.md)\n'
  );
  writeFileSync(join(path, 'tests/readme.test.ts'), 'release specification expectations');
  writeFileSync(join(path, 'tests/docsExamples.test.ts'), 'release HTML expectations');
}
function candidate(version = '1.2.3'): string {
  const root = directory();
  const source = join(root, 'source');
  sourceFixture(source, version);
  const output = join(root, 'candidate');
  buildReleaseDocs(source, output, binding(version));
  return output;
}

// AFA-263: execute the actual pipeline with offline process stand-ins. Documents and binary
// files are real; command failures exercise the same fail-closed path as npm and package tests.
function pipeline(failure?: string): {
  repository: string;
  output: string;
  calls: {
    tool: string;
    args: string[];
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    rendered?: string;
  }[];
  run: Run;
} {
  const repository = directory();
  const release = join(repository, 'release');
  sourceFixture(release);
  const output = join(repository, 'output');
  mkdirSync(output);
  writeFileSync(join(output, 'prior.txt'), 'previous verified docs');
  const calls: ReturnType<typeof pipeline>['calls'] = [];
  const run: Run = (tool, args, options = {}) => {
    calls.push({
      tool,
      args,
      ...options,
      rendered:
        args[0] === 'test:package' ? read(join(options.cwd!, 'docs/index.html')) : undefined,
    });
    const text = `${tool} ${args.join(' ')}`;
    if (failure === 'unpublished' && tool === 'npm' && args[0] === 'view')
      throw new Error('E404 unpublished');
    if (failure === 'ancestry' && args[0] === 'merge-base') throw new Error('not on main');
    if (failure === 'build' && tool === 'pnpm' && args[0] === 'build')
      throw new Error('build failed');
    if (failure === 'examples' && args[0] === 'test:package') throw new Error('example failed');
    if (
      failure === 'rendered' &&
      args[0] === 'test:package' &&
      calls[calls.length - 1]?.rendered?.includes('docs-package-version')
    )
      throw new Error('rendered example failed');
    if (text.startsWith('git rev-parse')) return revision;
    if (tool === 'npm' && args[0] === 'view')
      return JSON.stringify({
        name: '@afahy/fluent-measures',
        version: '1.2.3',
        gitHead: failure === 'gitHead' ? 'f'.repeat(40) : revision,
        dist: { integrity },
      });
    if (tool === 'tar') {
      const source = args[args.indexOf('-C') + 1];
      cpSync(release, source, { recursive: true });
      if (failure === 'missing-reference') rmSync(join(source, 'PARSING.md'));
      if (failure === 'manifest')
        writeFileSync(
          join(source, 'package.json'),
          '{"name":"@afahy/fluent-measures","version":"1.0.0"}'
        );
    }
    if (tool === 'npm' && args[0] === 'install') {
      const installed = join(options.cwd!, 'node_modules/@afahy/fluent-measures');
      mkdirSync(installed, { recursive: true });
      for (const file of ['dist', 'README.md', 'LICENSE', 'package.json'])
        cpSync(join(release, file), join(installed, file), { recursive: true });
      writeFileSync(
        join(options.cwd!, 'package-lock.json'),
        JSON.stringify({
          packages: {
            'node_modules/@afahy/fluent-measures': {
              integrity: failure === 'integrity' ? 'sha512-wrong' : integrity,
            },
          },
        })
      );
      if (failure === 'bytes') writeFileSync(join(installed, 'dist/index.js'), 'wrong package');
      if (failure === 'extra-file')
        writeFileSync(join(installed, 'unexpected.js'), 'unexpected package file');
    }
    return '';
  };
  return { repository, output, calls, run };
}

describe('release verification before promotion', () => {
  it.each([
    'latest',
    '^1.2.3',
    '1.2',
    'v1.2.3',
    '01.2.3',
    '../1.2.3',
    '1.2.3-beta.1',
    '1.2.3; echo unsafe',
  ])('rejects the non-exact stable selector %s', version => {
    expect(() => releaseVersion(version)).toThrow('exact stable');
  });
  it('binds the exact installed version and integrity to release files and release-owned examples', () => {
    const fixture = pipeline();
    verifyRelease('1.2.3', fixture);
    expect(read(join(fixture.output, 'release.json'))).toContain(revision);
    const install = fixture.calls.find(call => call.tool === 'npm' && call.args[0] === 'install');
    expect(install?.args).toEqual([
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--save-exact',
      '--registry=https://registry.npmjs.org',
      '@afahy/fluent-measures@1.2.3',
    ]);
    const tests = fixture.calls.filter(call => call.args[0] === 'test:package');
    expect(tests).toHaveLength(2);
    expect(tests[0].args).toEqual([
      'test:package',
      'tests/readme.test.ts',
      'tests/docsExamples.test.ts',
    ]);
    expect(tests[0].cwd).toMatch(/\/source$/);
    expect(tests[0].env?.FLUENT_MEASURES_PACKAGE_DIR).toMatch(/\/consumer$/);
    expect(tests[1].cwd).toBe(tests[0].cwd);
    expect(tests[1].env?.FLUENT_MEASURES_PACKAGE_DIR).toBe(
      tests[0].env?.FLUENT_MEASURES_PACKAGE_DIR
    );
    expect(tests[0].rendered).not.toContain('docs-package-version');
    expect(tests[1].rendered).toContain('docs-package-version');
    expect(tests[1].rendered).toContain('@afahy/fluent-measures@1.2.3');
    expect(existsSync(join(fixture.output, 'prior.txt'))).toBe(false);
  });
  it.each([
    'unpublished',
    'ancestry',
    'build',
    'examples',
    'rendered',
    'missing-reference',
    'manifest',
    'gitHead',
    'integrity',
    'bytes',
    'extra-file',
  ])('keeps the previous docs untouched after a %s failure', failure => {
    const fixture = pipeline(failure);
    expect(() => verifyRelease('1.2.3', fixture)).toThrow();
    expect(read(join(fixture.output, 'prior.txt'))).toBe('previous verified docs');
    expect(existsSync(join(fixture.output, 'release.json'))).toBe(false);
  });
  it('publishes release sources, exact install commands and version-qualified cross-links', () => {
    const path = candidate();
    const html = read(join(path, 'index.html'));
    const markdown = read(join(path, 'README.md'));
    expect(html).toContain('npm install @afahy/fluent-measures@1.2.3');
    expect(html).toContain('<span class="nowrap">@afahy/fluent-measures@1.2.3</span>');
    expect(html).toContain(
      '.code pre:has(.code-cmd) { white-space: pre-wrap; overflow-wrap: anywhere; }'
    );
    expect(html).toContain(`rel="canonical" href="${site}versions/1.2.3/"`);
    expect(html).toContain(
      'href="https://afahy.github.io/fluent-measures/versions/1.2.3/README.md"'
    );
    expect(markdown).toContain('Release-only text.');
    expect(markdown).toContain('parseMeasurement("6 ft"); // { value: 6, unit: "ft" }');
    expect(markdown).toContain(`](${site}versions/1.2.3/PARSING.md#ranges)`);
    expect(markdown).toContain(
      `](https://github.com/afahy/fluent-measures/blob/${revision}/src/index.ts)`
    );
    expect(read(join(path, 'PARSING.md'))).toContain(`](${site}versions/1.2.3/README.md)`);
    expect(html).not.toContain('may include changes not yet released');
    expect(readDocsArtifact(path).version).toBe('1.2.3');
  });
  it.each([
    ['index.html', 'docs-package-version', 'wrong-version'],
    ['README.md', revision, 'f'.repeat(40)],
    ['PARSING.md', '/versions/1.2.3/README.md', '/README.md'],
    ['llms.txt', '@afahy/fluent-measures@1.2.3', '@afahy/fluent-measures@2.0.0'],
    ['release.json', '1.2.3', '2.0.0'],
    ['README.md', '#ranges', '#missing-anchor'],
    ['index.html', 'href="#usage"', 'href="#missing-section"'],
    // AFA-270: each release page needs a link to its docs for your version section.
    ['index.html', 'href="#versions"', 'href="#usage"'],
  ])('rejects mismatched release content in %s', (file, from, to) => {
    const path = candidate();
    writeFileSync(join(path, file), read(join(path, file)).split(from).join(to));
    expect(() => readDocsArtifact(path)).toThrow();
  });
  // AFA-270: the archived 0.2.0 page keeps its link to the README section. Its digests are
  // fixed. A later release must link to the HTML section.
  function withReadmeLink(version: string): string {
    const path = candidate(version);
    const html = read(join(path, 'index.html'));
    expect(html).toContain('<a href="#versions">Docs for your version</a>');
    writeFileSync(
      join(path, 'index.html'),
      html.replace(
        'href="#versions"',
        `href="${site}versions/${version}/README.md#documentation-for-your-version"`
      )
    );
    return path;
  }
  it('accepts the README section link on the archived 0.2.0 page', () => {
    expect(readDocsArtifact(withReadmeLink('0.2.0')).version).toBe('0.2.0');
  });
  it('rejects the README section link on a later release page', () => {
    expect(() => readDocsArtifact(withReadmeLink('1.2.3'))).toThrow('docs for your version link');
  });
  it('accepts the link to the HTML section with other attributes and line breaks', () => {
    const path = candidate();
    const html = read(join(path, 'index.html'));
    writeFileSync(
      join(path, 'index.html'),
      html.replace(
        '<a href="#versions">Docs for your version</a>',
        '<a class="resource" href="#versions">\n  Docs for your version\n</a>'
      )
    );
    expect(readDocsArtifact(path).version).toBe('1.2.3');
  });
});

describe('durable release promotion', () => {
  it('retains older references byte-for-byte and makes root aliases identify the selected release', () => {
    const previous = join(directory(), 'archive');
    preparePromotion(candidate(), undefined, previous);
    const before = snapshot(join(previous, 'versions/1.2.3'));
    const output = join(directory(), 'new-archive');
    preparePromotion(candidate('1.10.0'), previous, output);
    expect(snapshot(join(output, 'versions/1.2.3'))).toEqual(before);
    expect(validateArchive(output).current).toBe('1.10.0');
    expect(read(join(output, 'README.md'))).toContain('@afahy/fluent-measures@1.10.0');
    expect(read(join(output, 'versions/1.2.3/README.md'))).toContain(
      '@afahy/fluent-measures@1.2.3'
    );
    expect(read(join(output, 'versions.json'))).toContain('"1.2.3"');
  });
  it('rejects an older rerun without touching the prior archive or output', () => {
    const previous = join(directory(), 'archive');
    preparePromotion(candidate('2.0.0'), undefined, previous);
    const before = snapshot(previous);
    const output = directory();
    writeFileSync(join(output, 'unchanged'), 'keep');
    expect(() => preparePromotion(candidate(), previous, output)).toThrow(
      'Refusing to replace 2.0.0 with older 1.2.3'
    );
    expect(snapshot(previous)).toEqual(before);
    expect(read(join(output, 'unchanged'))).toBe('keep');
  });
  it('allows identical recovery but rejects changing a previously verified version', () => {
    const next = candidate();
    const previous = join(directory(), 'archive');
    preparePromotion(next, undefined, previous);
    const output = join(directory(), 'retry');
    preparePromotion(next, previous, output);
    expect(snapshot(output)).toEqual(snapshot(previous));
    writeFileSync(join(next, 'tailwind.css'), 'changed stylesheet');
    expect(() => preparePromotion(next, previous, output)).toThrow('immutable');
  });
  it('fails closed if a retained file is absent or changes, even when promoting a valid newer release', () => {
    const previous = join(directory(), 'archive');
    preparePromotion(candidate(), undefined, previous);
    rmSync(join(previous, 'versions/1.2.3/PARSING.md'));
    expect(() =>
      preparePromotion(candidate('2.0.0'), previous, join(directory(), 'output'))
    ).toThrow('content changed');
  });
  it('checks public delivery of root and retained version references with bounded failures', async () => {
    const first = join(directory(), 'first');
    preparePromotion(candidate(), undefined, first);
    const output = join(directory(), 'second');
    preparePromotion(candidate('2.0.0'), first, output);
    const artifact = readDocsArtifact(output);
    const fetchImpl = vi.fn<typeof fetch>(async input => {
      const path = new URL(String(input)).pathname.replace('/fluent-measures/', '') || 'index.html';
      return new Response(read(join(output, path)));
    });
    await verifyPublicDocs(artifact, { fetchImpl, report: vi.fn() });
    expect(fetchImpl).toHaveBeenCalledTimes(16);
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toContain(
      `${site}versions/1.2.3/PARSING.md?revision=${revision}`
    );
    fetchImpl.mockResolvedValue(new Response('stale verified release'));
    await expect(verifyPublicDocs(artifact, { fetchImpl, attempts: 1 })).rejects.toThrow(
      'content, links or source revision differ'
    );
  });
  it('pushes only a fast-forward archive branch and rejects a stale run against the durable remote', () => {
    const repository = directory();
    const remote = directory();
    git(remote, 'init', '--bare', '--initial-branch=main');
    git(repository, 'init', '--initial-branch=main');
    git(repository, 'config', 'user.name', 'Docs test');
    git(repository, 'config', 'user.email', 'docs@example.test');
    writeFileSync(join(repository, 'source.txt'), 'unreleased source must not be archived');
    git(repository, 'add', '.');
    git(repository, 'commit', '-m', 'test: source');
    git(repository, 'remote', 'add', 'origin', remote);
    const main = git(repository, 'rev-parse', 'HEAD').trim();
    const run: Run = (tool, args, options = {}) =>
      execFileSync(tool, args, {
        ...options,
        encoding: 'utf8',
        env: {
          ...withoutGitRepository(options.env),
          ...(options.env?.GIT_INDEX_FILE ? { GIT_INDEX_FILE: options.env.GIT_INDEX_FILE } : {}),
        },
        stdio: 'pipe',
      }).trim();
    const output = join(directory(), 'site');
    const next = candidate('2.0.0');
    promoteDocs(next, output, { repository, run });
    const promoted = git(remote, 'rev-parse', 'verified-docs').trim();
    expect(git(remote, 'show', 'verified-docs:versions.json')).toContain('"current": "2.0.0"');
    expect(git(remote, 'ls-tree', '--name-only', 'verified-docs')).not.toContain('source.txt');
    expect(git(repository, 'rev-parse', 'HEAD').trim()).toBe(main);
    expect(git(repository, 'status', '--porcelain')).toBe('');
    promoteDocs(next, output, { repository, run });
    expect(git(remote, 'rev-parse', 'verified-docs').trim()).toBe(promoted);
    expect(() => promoteDocs(candidate(), output, { repository, run })).toThrow('older');
    expect(git(remote, 'rev-parse', 'verified-docs').trim()).toBe(promoted);
    const racedRun: Run = (tool, args, options) => {
      if (tool === 'git' && args[0] === 'push') {
        promoteDocs(candidate('4.0.0'), join(directory(), 'newer'), { repository, run });
      }
      return run(tool, args, options);
    };
    expect(() => promoteDocs(candidate('3.0.0'), output, { repository, run: racedRun })).toThrow();
    expect(git(remote, 'show', 'verified-docs:versions.json')).toContain('"current": "4.0.0"');
  });
});
