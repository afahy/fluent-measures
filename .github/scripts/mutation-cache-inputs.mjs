// Project only audited irrelevant inputs out of the incremental cache key. Unknown fields,
// scripts and workflow structures stay in the key rather than risk reusing stale results.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
for (const field of ['description', 'keywords', 'author']) delete manifest[field];
const releaseOnly = new Set([
  'release',
  'release:changeset',
  'release:publish',
  'release:validate',
  'release:version',
]);
// Keep lifecycle/runner scripts and any release command reachable from a retained script,
// including transitive references. Dynamic shell commands make reachability uncertain.
let changed;
do {
  changed = false;
  for (const [name, command] of Object.entries(manifest.scripts ?? {})) {
    if (releaseOnly.has(name)) continue;
    const words = command.split(/[^\w:-]+/);
    for (const candidate of releaseOnly) {
      if (words.includes(candidate) || /\$|\beval\b/.test(command)) {
        releaseOnly.delete(candidate);
        changed = true;
      }
    }
  }
} while (changed);
for (const name of releaseOnly) delete manifest.scripts?.[name];

function workflowInputs(source) {
  // This is a conservative text projection, not a YAML parser. Only drop the three known
  // unrelated jobs in the current block layout. Anchors/aliases can couple otherwise unrelated
  // jobs; unfamiliar layouts/dependencies keep the entire workflow. Shared settings stay too.
  if (/(?:^|[\s[{,])[*&][\w-]+|^ *\t/m.test(source)) return source;
  const sections = source.split(/(?=^\S)/m);
  const jobs = sections.filter(section => section.startsWith('jobs:\n'));
  if (jobs.length !== 1) return source;
  const blocks = jobs[0]
    .slice('jobs:\n'.length)
    .split(/(?=^ {2}(?!#)\S)/m)
    .filter(block => block.trim());
  const names = blocks.map(block => /^ {2}([\w-]+):\s*\n/.exec(block)?.[1]);
  const mutationJobs = ['mutation-inventory', 'mutation', 'mutation-report'];
  if (names.includes(undefined) || mutationJobs.some(name => !names.includes(name))) return source;
  const retained = blocks.filter((_, i) => !['test', 'package', 'ci-ok'].includes(names[i]));
  for (const block of retained) {
    const lines = block
      .split('\n')
      .slice(1)
      .filter(line => line.trim() && !line.trimStart().startsWith('#'));
    if (
      !lines.some(line => /^ {4}\S/.test(line)) ||
      lines.some(
        line => /^ {0,3}\S/.test(line) || (/^ {4}\S/.test(line) && !/^ {4}[\w-]+:/.test(line))
      )
    )
      return source;
    for (const [, needs] of block.matchAll(/^ {4}needs:([^\n]*)/gm)) {
      if (
        !/^ *(?:[\w-]+|\[[\w, -]+\]) *$/.test(needs) ||
        needs.match(/[\w-]+/g).some(name => !mutationJobs.includes(name))
      )
        return source;
    }
  }
  return sections
    .map(section => (section === jobs[0] ? `jobs:\n${retained.join('')}` : section))
    .join('');
}

mkdirSync('reports/mutation-cache', { recursive: true });
writeFileSync('reports/mutation-cache/package.json', JSON.stringify(manifest));
writeFileSync(
  'reports/mutation-cache/ci.yml',
  workflowInputs(readFileSync('.github/workflows/ci.yml', 'utf8'))
);
