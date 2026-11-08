// Compare public delivery with the exact Pages artifact, including its content, links and SHA.
// This runs only after deployment; tests inject fetch and sleep and never contact public hosts.
import { existsSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { join, resolve, sep } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const site = 'https://afahy.github.io/fluent-measures/';
const files = ['index.html', 'README.md', 'PARSING.md', 'llms.txt'];

// The page links to its own "Docs for your version" section. The archived 0.2.0 page keeps
// its older link to the README section, because its digests are fixed.
function hasVersionLink(html, legacyReadme) {
  const target = /<a\s[^>]*\bhref="([^"]+)"[^>]*>\s*Docs for your version\s*<\/a>/.exec(html)?.[1];
  return (
    (target === '#versions' && /\sid="versions"/.test(html)) ||
    (legacyReadme !== undefined && target === `${legacyReadme}#documentation-for-your-version`)
  );
}

export function readDocsArtifact(directory) {
  const documents = Object.fromEntries(
    files.map(file => [file, readFileSync(join(directory, file), 'utf8')])
  );
  const revision = /<meta name="docs-source-revision" content="([a-f0-9]{40})" \/>/.exec(
    documents['index.html']
  )?.[1];
  if (!revision) throw new Error('Pages artifact has no valid HTML source revision');
  const source = `https://github.com/afahy/fluent-measures/tree/${revision}`;
  const metadata = `Source revision: [${revision}](${source}).`;
  const version = /<meta name="docs-package-version" content="([0-9]+\.[0-9]+\.[0-9]+)" \/>/.exec(
    documents['index.html']
  )?.[1];
  if (version) {
    const release = JSON.parse(readFileSync(join(directory, 'release.json'), 'utf8'));
    assert.equal(release.version, version, 'Pages artifact version mismatch');
    assert.equal(release.revision, revision, 'Pages artifact source mismatch');
    assert.match(
      release.integrity ?? '',
      /^sha512-[A-Za-z0-9+/]+={0,2}$/,
      'Pages artifact integrity missing'
    );
    const base = `${site}versions/${version}/`;
    const packageLabel = `@afahy/fluent-measures@${version}`;
    for (const [file, body] of Object.entries(documents)) {
      for (const marker of file === 'index.html'
        ? [packageLabel, source, `href="${base}README.md"`, `href="${base}llms.txt"`]
        : [metadata, packageLabel, `](${base}README.md`, `](${base}PARSING.md`]) {
        if (!body.includes(marker))
          throw new Error(`Pages artifact ${file} is missing ${JSON.stringify(marker)}`);
      }
      if (/Docs track|may include changes not yet released|blob\/main\//.test(body)) {
        throw new Error(`Pages artifact ${file} contains an unreleased reference`);
      }
    }
    for (const [file, heading] of [
      ['README.md', '# fluent-measures'],
      ['PARSING.md', '# Parsing rules'],
      ['llms.txt', '# fluent-measures'],
    ]) {
      if (!documents[file].startsWith(heading + '\n'))
        throw new Error(`Pages artifact ${file} has the wrong heading`);
    }
    const html = documents['index.html'];
    if (!hasVersionLink(html, version === '0.2.0' ? `${base}README.md` : undefined))
      throw new Error('Pages artifact index.html is missing the docs for your version link');
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => id));
    for (const [, href] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
      if (href.startsWith('#')) {
        assert.ok(ids.has(href.slice(1)), `Pages artifact has missing anchor ${href}`);
      } else if (!/^(?:[a-z][\w+.-]*:|\/\/)/i.test(href)) {
        const target = resolve(directory, href.split(/[?#]/)[0]);
        assert.ok(
          target.startsWith(resolve(directory) + sep) && existsSync(target),
          `Pages artifact has missing local asset ${href}`
        );
      }
    }
    const anchors = Object.fromEntries(
      ['README.md', 'PARSING.md'].map(file => [
        file,
        new Set(
          [...documents[file].matchAll(/^#{1,6} (.+)$/gm)].map(([, heading]) =>
            heading
              .toLowerCase()
              .replace(/[^\p{L}\p{N}_ -]/gu, '')
              .replaceAll(' ', '-')
          )
        ),
      ])
    );
    for (const [file, body] of Object.entries(documents)) {
      const links =
        file === 'index.html'
          ? [...body.matchAll(/\bhref="([^"]+)"/g)].map(([, href]) => href)
          : [...body.matchAll(/\]\(([^\s)]+)\)/g)].map(([, href]) => href);
      for (const href of links) {
        if (file !== 'index.html' && href.startsWith('#')) {
          assert.ok(
            anchors[file]?.has(href.slice(1)),
            `Pages artifact ${file} has missing anchor ${href}`
          );
        } else if (href.startsWith(base)) {
          const target = new URL(href);
          const path = target.pathname.slice(new URL(base).pathname.length) || 'index.html';
          assert.ok(
            Object.hasOwn(documents, path) || existsSync(join(directory, path)),
            `Pages artifact has missing reference ${href}`
          );
          if (target.hash)
            assert.ok(
              anchors[path]?.has(target.hash.slice(1)),
              `Pages artifact has missing reference anchor ${href}`
            );
        }
      }
    }
    documents['release.json'] = readFileSync(join(directory, 'release.json'), 'utf8');
    // An assembled deployment includes every retained release, so public verification checks
    // old URLs as well as the current aliases. The archive validator checks file digests too.
    if (existsSync(join(directory, 'versions.json'))) {
      const index = JSON.parse(readFileSync(join(directory, 'versions.json'), 'utf8'));
      assert.equal(index.current, version, 'Pages artifact current version mismatch');
      documents['versions.json'] = readFileSync(join(directory, 'versions.json'), 'utf8');
      for (const retained of Object.keys(index.releases)) {
        if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(retained))
          throw new Error('Pages artifact invalid retained version');
        const archived = readDocsArtifact(join(directory, 'versions', retained));
        assert.equal(archived.version, retained, 'Pages artifact retained version mismatch');
        for (const [file, body] of Object.entries(archived.documents))
          documents[`versions/${retained}/${file}`] = body;
      }
    }
    return { version, revision, documents };
  }
  if (existsSync(join(directory, 'release.json')))
    throw new Error('Pages artifact has no package version');
  const required = {
    'index.html': ['fluent-measures', 'href="README.md"', 'href="llms.txt"', source],
    'README.md': [
      '# fluent-measures',
      metadata,
      `](${site})`,
      `](${site}llms.txt)`,
      `](${site}PARSING.md)`,
    ],
    'PARSING.md': ['# Parsing rules', metadata, `](${site}README.md)`],
    'llms.txt': ['# fluent-measures', metadata, `](${site}README.md)`, `](${site}PARSING.md)`],
  };
  if (!hasVersionLink(documents['index.html']))
    throw new Error('Pages artifact index.html is missing the docs for your version link');
  for (const [file, markers] of Object.entries(required)) {
    for (const marker of markers) {
      if (!documents[file].includes(marker)) {
        throw new Error(`Pages artifact ${file} is missing ${JSON.stringify(marker)}`);
      }
    }
  }
  return { revision, documents };
}

export async function verifyPublicDocs(
  artifact,
  {
    fetchImpl = fetch,
    sleepImpl = sleep,
    report = console.log,
    attempts = 6,
    timeoutMs = 10_000,
    delayMs = 10_000,
  } = {}
) {
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 6) {
    throw new Error('Public verification needs between 1 and 6 attempts');
  }
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const outcomes = await Promise.allSettled(
      Object.keys(artifact.documents).map(async file => {
        const url = new URL(file === 'index.html' ? './' : file, site);
        // Avoid a stale cached response without changing the document's canonical location.
        url.searchParams.set('revision', artifact.revision);
        const response = await fetchImpl(url, {
          signal: AbortSignal.timeout(timeoutMs),
          cache: 'no-store',
        });
        if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
        const body = await response.text();
        if (body !== artifact.documents[file]) {
          throw new Error(
            `${url}: content, links or source revision differ from the deployed artifact`
          );
        }
      })
    );
    const failures = outcomes.flatMap((outcome, index) =>
      outcome.status === 'rejected'
        ? [`${Object.keys(artifact.documents)[index]}: ${outcome.reason.message}`]
        : []
    );
    if (failures.length === 0) {
      report(
        `Verified ${artifact.version ? `${Object.keys(artifact.documents).length} public files for npm ${artifact.version}` : 'all four public documents'} at source revision ${artifact.revision} (attempt ${attempt}/${attempts}).`
      );
      return;
    }
    const detail = `Public docs verification ${attempt}/${attempts}, expected ${artifact.revision}:\n${failures.join('\n')}`;
    if (attempt === attempts) {
      throw new Error(
        `${detail}\nCheck the Pages deployment and public responses; rerun verification after propagation. Do not rebuild the expected artifact from a newer main.`
      );
    }
    report(detail);
    await sleepImpl(delayMs);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await verifyPublicDocs(readDocsArtifact(process.argv[2] ?? 'build/docs'));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
