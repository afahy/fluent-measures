// Build the Pages artifact from the same checkout as the documentation and parser sources.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const site = 'https://afahy.github.io/fluent-measures/';
const repositoryUrl = 'https://github.com/afahy/fluent-measures';
const references = ['README.md', 'PARSING.md'];
const releaseNote = 'Docs track main and may include changes not yet released on npm.';

// These references use inline Markdown links. Keep anchors and external URLs intact, send
// published references to Pages, and pin other repository links to this source revision.
function publishLinks(markdown, revision) {
  return markdown.replace(/(\]\()([^\s)]+)(\))/g, (link, open, href, close) => {
    const sourcePrefix = `${repositoryUrl}/blob/main/`;
    let target = href.startsWith(sourcePrefix) ? href.slice(sourcePrefix.length) : href;
    if (/^(?:[a-z][\w+.-]*:|\/\/|#)/i.test(target)) return link;
    target = target.replace(/^\.\//, '');
    const file = target.split(/[?#]/)[0];
    const base = references.includes(file) ? site : `${repositoryUrl}/blob/${revision}/`;
    return `${open}${new URL(target, base).href}${close}`;
  });
}

export function buildDocs(repository = root) {
  // HEAD identifies the files actually checked out, including a manual deployment or a CI
  // merge checkout. GITHUB_SHA can name a different commit; the npm version is not a revision.
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repository,
    encoding: 'utf8',
  }).trim();
  const source = `${repositoryUrl}/tree/${revision}`;
  const metadata = `${releaseNote}\nSource revision: [${revision}](${source}).`;
  const output = join(repository, 'build/docs');
  const page = readFileSync(join(repository, 'docs/index.html'), 'utf8');
  const marker = /<!-- docs-source -->[\s\S]*?<!-- \/docs-source -->/g;
  if (page.match(marker)?.length !== 1) throw new Error('Docs page needs one source marker');
  const publishedPage = page
    .replace(marker, `<a href="${source}">${revision.slice(0, 7)}</a>`)
    .replace('</head>', `<meta name="docs-source-revision" content="${revision}" />\n  </head>`);

  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  // Copy only production docs, never the repository root or the local palette preview.
  cpSync(join(repository, 'docs'), output, { recursive: true });
  writeFileSync(join(output, 'index.html'), publishedPage);
  for (const file of references) {
    const markdown = publishLinks(readFileSync(join(repository, file), 'utf8'), revision);
    writeFileSync(join(output, file), markdown.replace(/^(# .+\n)/, `$1\n${metadata}\n`));
  }
  writeFileSync(
    join(output, 'llms.txt'),
    `# fluent-measures

> @afahy/fluent-measures is a TypeScript library that reads heights and weights from everyday text and returns structured measurements.

${metadata}

## Documentation

- [README](${site}README.md): Installation, usage, API reference, supported units and troubleshooting.
- [Parsing rules](${site}PARSING.md): The authoritative parsing specification and examples, including ambiguity and unsupported input.

## Installed versions

Find your installed version with \`npm ls @afahy/fluent-measures\`. This site tracks main, not that release.
See [documentation for your version](${site}README.md#documentation-for-your-version) for tag selection and historical caveats.
Version 0.2.0 has a verified [README](https://raw.githubusercontent.com/afahy/fluent-measures/v0.2.0/README.md) and [parsing reference](https://raw.githubusercontent.com/afahy/fluent-measures/v0.2.0/PARSING.md).
Older tags v0.1.0 and v0.1.1 have no PARSING.md and have package metadata mismatches; use the README shipped with those packages.
`
  );
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(`Built Pages artifact at ${buildDocs()}`);
}
