import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execPath } from 'node:process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { git, withoutGitRepository } from './gitEnvironment';

const root = fileURLToPath(new URL('../', import.meta.url));
const builder = new URL('../.github/scripts/docs-build.mjs', import.meta.url).href;
const site = 'https://afahy.github.io/fluent-measures/';
const repositoryUrl = 'https://github.com/afahy/fluent-measures';
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture(): string {
  const directory = mkdtempSync(join(tmpdir(), 'fm-pages-'));
  directories.push(directory);
  cpSync(join(root, 'docs'), join(directory, 'docs'), { recursive: true });
  for (const file of ['README.md', 'PARSING.md']) cpSync(join(root, file), join(directory, file));
  // Local preview assets and unrelated root files must never enter the Pages artifact.
  for (const path of ['.docs-preview', '.github/docs-preview']) {
    mkdirSync(join(directory, path), { recursive: true });
    writeFileSync(join(directory, path, 'palette-preview.js'), 'local preview');
  }
  writeFileSync(join(directory, '.env'), 'LOCAL_ONLY=1');
  git(directory, 'init', '--initial-branch=main');
  git(directory, 'config', 'user.name', 'Docs test');
  git(directory, 'config', 'user.email', 'docs@example.test');
  git(directory, 'add', 'docs', 'README.md', 'PARSING.md');
  git(directory, 'commit', '-m', 'docs: fixture');
  return directory;
}

function build(directory: string): string {
  execFileSync(
    execPath,
    [
      '--input-type=module',
      '-e',
      `import { buildDocs } from ${JSON.stringify(builder)}; buildDocs(process.argv[1]);`,
      directory,
    ],
    {
      cwd: directory,
      // A workflow's event SHA must not replace the checked-out source revision.
      env: { ...withoutGitRepository(), GITHUB_SHA: 'f'.repeat(40) },
      stdio: 'pipe',
    }
  );
  return join(directory, 'build/docs');
}

function read(directory: string, file: string): string {
  return readFileSync(join(directory, file), 'utf8');
}

function fileNames(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => join(entry.parentPath, entry.name).slice(directory.length + 1))
    .sort();
}

function codeBlocks(markdown: string): string[] {
  return markdown.match(/^```[^\n]*\n[\s\S]*?^```/gm) ?? [];
}

describe('published documentation', () => {
  it('builds only production assets and the generated references from the deployed commit', () => {
    expect.hasAssertions();
    const directory = fixture();
    const revision = git(directory, 'rev-parse', 'HEAD').trim();
    const output = build(directory);
    expect(fileNames(output)).toEqual(
      [...fileNames(join(directory, 'docs')), 'README.md', 'PARSING.md', 'llms.txt'].sort()
    );
    for (const file of ['README.md', 'PARSING.md', 'llms.txt']) {
      expect(read(output, file)).toContain(
        `Source revision: [${revision}](${repositoryUrl}/tree/${revision}).`
      );
      expect(read(output, file)).toContain(
        'Docs track main and may include changes not yet released on npm.'
      );
    }
    const html = read(output, 'index.html');
    expect(html).toContain(`<meta name="docs-source-revision" content="${revision}" />`);
    expect(html).toContain(
      `<a href="${repositoryUrl}/tree/${revision}">${revision.slice(0, 7)}</a>`
    );
    expect(html).not.toContain('local checkout');
    expect(read(output, 'tailwind.css')).toBe(read(directory, 'docs/tailwind.css'));
    expect(read(directory, 'docs/index.html')).toContain('<!-- docs-source -->');
    expect(html).toContain(
      'Docs track <code>main</code> and may include changes not yet released on npm.'
    );
  });

  it('preserves the specification examples and links readers to the published parsing reference', () => {
    const directory = fixture();
    const output = build(directory);
    const readme = read(output, 'README.md');
    const parsing = read(output, 'PARSING.md');
    expect(codeBlocks(readme)).toEqual(codeBlocks(read(directory, 'README.md')));
    expect(codeBlocks(parsing)).toEqual(codeBlocks(read(directory, 'PARSING.md')));
    expect(readme).toContain(`[PARSING.md](${site}PARSING.md#units-before-a-number)`);
    expect(readme).toContain(`[PARSING.md](${site}PARSING.md)`);
    expect(parsing).toContain(`[README](${site}README.md)`);
    expect(readme).toContain('[Supported units](#supported-units)');
    expect(parsing).toContain('[two-part rules](#more-than-one-measurement)');
  });

  it('refreshes the copied sources and revision and removes stale output on every build', () => {
    const directory = fixture();
    const output = build(directory);
    const previous = git(directory, 'rev-parse', 'HEAD').trim();
    writeFileSync(join(output, 'stale.txt'), 'old output');
    writeFileSync(join(directory, 'README.md'), '# Updated reference\n\nFresh source text.\n');
    writeFileSync(join(directory, 'PARSING.md'), '# Updated rules\n\nFresh rules.\n');
    git(directory, 'add', 'README.md', 'PARSING.md');
    git(directory, 'commit', '-m', 'docs: update sources');
    const revision = git(directory, 'rev-parse', 'HEAD').trim();
    build(directory);
    expect(revision).not.toBe(previous);
    expect(read(output, 'README.md')).toContain('Fresh source text.');
    expect(read(output, 'PARSING.md')).toContain('Fresh rules.');
    expect(read(output, 'llms.txt')).toContain(revision);
    expect(read(output, 'index.html')).toContain(revision);
    expect(read(output, 'README.md')).not.toContain(previous);
    expect(fileNames(output)).not.toContain('stale.txt');
  });

  it('resolves relative reference and repository links without losing anchors or external links', () => {
    const directory = fixture();
    writeFileSync(
      join(directory, 'README.md'),
      '# Links\n\n[Rules](./PARSING.md#labels)\n[Contribute](CONTRIBUTING.md)\n[External](https://example.com/a?q=b#c)\n'
    );
    const revision = git(directory, 'rev-parse', 'HEAD').trim();
    const markdown = read(build(directory), 'README.md');
    expect(markdown).toContain(`[Rules](${site}PARSING.md#labels)`);
    expect(markdown).toContain(`[Contribute](${repositoryUrl}/blob/${revision}/CONTRIBUTING.md)`);
    expect(markdown).toContain('[External](https://example.com/a?q=b#c)');
  });

  it('exposes discoverable static links and serves each generated reference under the Pages subpath', async () => {
    expect.hasAssertions();
    const directory = fixture();
    const output = build(directory);
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const name = url.pathname.slice('/fluent-measures/'.length) || 'index.html';
      if (!url.pathname.startsWith('/fluent-measures/') || !fileNames(output).includes(name)) {
        res.writeHead(404).end();
        return;
      }
      res.setHeader('Content-Type', name.endsWith('.html') ? 'text/html' : 'text/plain');
      res.end(read(output, name));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}/fluent-measures/`;
    try {
      const html = await (await fetch(base)).text();
      expect(html).toContain('<a href="README.md">View Markdown</a>');
      expect(html).toContain('<a href="llms.txt">Agent index (llms.txt)</a>');
      expect(html).toContain('rel="alternate" type="text/markdown" href="README.md"');
      expect(html).toContain('rel="describedby" type="text/plain" href="llms.txt"');
      const index = await (await fetch(new URL('llms.txt', base))).text();
      expect(index).toContain('@afahy/fluent-measures');
      const urls = [...index.matchAll(/\]\((https:\/\/afahy\.github\.io\/[^)]+)\)/g)].map(
        ([, url]) => url
      );
      expect(urls).toEqual([`${site}README.md`, `${site}PARSING.md`]);
      for (const url of urls) {
        const response = await fetch(new URL(new URL(url).pathname, base));
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('text/plain');
        const markdown = await response.text();
        const file = new URL(url).pathname.split('/').pop()!;
        expect(markdown.split('\n')[0]).toBe(read(directory, file).split('\n')[0]);
        expect(codeBlocks(markdown)).toEqual(codeBlocks(read(directory, file)));
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve()))
      );
    }
  });

  it('fails the build if the HTML source revision would be silently omitted', () => {
    const directory = fixture();
    writeFileSync(
      join(directory, 'docs/index.html'),
      '<html><head></head><body>Docs</body></html>'
    );
    expect(() => build(directory)).toThrow('Docs page needs one source marker');
  });
});
