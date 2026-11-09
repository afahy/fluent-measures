import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The feature map in features/ tells an agent each way to reach a feature and the tests that check
// it. These tests keep the map complete and correct: features/README.md gives the rules.
const HEADINGS = [
  '## What it does',
  '## How a user reaches it',
  '## Where the rules are',
  '## How to verify it',
];
const index = readFileSync('features/README.md', 'utf8');
const features = readdirSync('features')
  .filter(name => name.endsWith('.md') && name !== 'README.md')
  .map(name => ({ name, text: readFileSync(`features/${name}`, 'utf8') }));
const all = features.map(({ text }) => text).join('\n');

/** The names in backticks on each line that starts with a label, such as "- Corpus categories:". */
function listed(text: string, label: string): string[] {
  const lines = text.split('\n');
  const names: string[] = [];
  for (let at = 0; at < lines.length; at++) {
    if (!lines[at].startsWith(`- ${label}:`)) continue;
    // A list can go on over indented lines.
    let item = lines[at];
    while (lines[at + 1]?.startsWith('  ')) item += lines[++at];
    names.push(...[...item.matchAll(/`([^`]+)`/g)].map(([, name]) => name));
  }
  return names;
}

/** The "## " and "### " headings of a Markdown file. */
function headings(path: string): string[] {
  return [...readFileSync(path, 'utf8').matchAll(/^#{2,3} (.+)$/gm)].map(([, heading]) => heading);
}

describe('the feature map', () => {
  it('has the four sections in each feature file, in order', () => {
    expect.hasAssertions();
    expect(features.length).toBeGreaterThan(0);
    for (const { name, text } of features) {
      const found = text.split('\n').filter(line => line.startsWith('## '));
      expect(found, name).toEqual(HEADINGS);
      expect(text.startsWith('# '), name).toBe(true);
    }
  });

  it('links each feature file from the index, and nothing else', () => {
    const links = [...index.matchAll(/\]\(([\w-]+\.md)\)/g)].map(([, file]) => file).sort();
    expect(links).toEqual(features.map(({ name }) => name).sort());
  });

  it('lists each parser test file', () => {
    const tests = readdirSync('tests').filter(name => /^parseMeasurement.*\.test\.ts$/.test(name));
    const missing = tests.filter(name => !listed(all, 'Tests').includes(`tests/${name}`));
    expect(tests.length).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  it('lists each corpus category in one feature file', () => {
    const corpus = readFileSync('tests/corpus/measurements.jsonl', 'utf8');
    const categories = new Set(
      corpus
        .split('\n')
        .filter(Boolean)
        .map(line => (JSON.parse(line) as { category: string }).category)
    );
    const named = features.flatMap(({ text }) => listed(text, 'Corpus categories'));
    expect(named.sort()).toEqual([...categories].sort());
  });

  it('names each file that exists', () => {
    const paths = features.flatMap(({ text }) => [
      ...listed(text, 'Source'),
      ...listed(text, 'Tests'),
      ...listed(text, 'Properties'),
    ]);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.filter(path => !existsSync(path))).toEqual([]);
  });

  it('names each property test that exists', () => {
    const properties = readFileSync('tests/properties.test.ts', 'utf8');
    const named = [...all.matchAll(/^- Properties: "([^"]+)"/gm)].map(([, name]) => name);
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter(name => !properties.includes(`describe('${name}'`))).toEqual([]);
  });

  it('maps each section of PARSING.md, and names only sections that exist', () => {
    const references = [...all.matchAll(/^- (README\.md|PARSING\.md), "([^"]+)"$/gm)].map(
      ([, file, heading]) => ({ file, heading })
    );
    const missing = references.filter(({ file, heading }) => !headings(file).includes(heading));
    expect(missing).toEqual([]);
    const mapped = references.filter(({ file }) => file === 'PARSING.md').map(r => r.heading);
    expect(headings('PARSING.md').filter(heading => !mapped.includes(heading))).toEqual([]);
  });
});
