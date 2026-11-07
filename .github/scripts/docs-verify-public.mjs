// Compare public delivery with the exact Pages artifact, including its content, links and SHA.
// This runs only after deployment; tests inject fetch and sleep and never contact public hosts.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const site = 'https://afahy.github.io/fluent-measures/';
const files = ['index.html', 'README.md', 'PARSING.md', 'llms.txt'];

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
  const required = {
    'index.html': [
      'fluent-measures',
      'href="README.md"',
      'href="llms.txt"',
      'href="README.md#documentation-for-your-version"',
      source,
    ],
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
      files.map(async file => {
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
      outcome.status === 'rejected' ? [`${files[index]}: ${outcome.reason.message}`] : []
    );
    if (failures.length === 0) {
      report(
        `Verified all four public documents at source revision ${artifact.revision} (attempt ${attempt}/${attempts}).`
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
