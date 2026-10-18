import { describe, expect, it } from 'vitest';
import {
  addedIgnores,
  assessRisk,
  changedResults,
  consumerFieldChanges,
  corpusChanges,
  deletedTests,
  exampleChanges,
  exampleLines,
  listsChangedResults,
  nameStatus,
  parseCorpus,
  parseCorpusReport,
  parseResults,
  removedExpects,
  resultChanges,
  scriptsRun,
  sizeChanges,
  sizeLimits,
  sizes,
  summary,
  testLimits,
  testSettings,
} from '../.github/scripts/evidence.mjs';
import type { Facts } from '../.github/scripts/evidence.d.mts';

/** A corpus snapshot file in the form that tests/corpus.test.ts writes. */
function report(lines: string[]): string {
  return [
    '// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html',
    '',
    'exports[`measurement corpus > matches the committed score 1`] = `',
    `"${lines.join('\n')}"`,
    '`;',
    '',
  ].join('\n');
}

const BASE_REPORT = report([
  'Category                 total   agree   wrong  missed  throws',
  'all                          3       1       1       1       0',
  '',
  'symbols                      3       1       1       1       0',
  '',
  'Entries with the outcome "wrong" (1):',
  '',
  'symbols-b (symbols)',
  '  input:    "5ft11\\\\""',
  '  options:  {}',
  '  expected: 71 in (height)',
  '  actual:   5 ft (height)',
  '',
  'Entries with the outcome "missed" (1):',
  '',
  'symbols-c (symbols)',
  '  input:    "6 \\`ft\\`"',
  '  options:  {}',
  '  expected: 6 ft (height)',
  '  actual:   null',
  '',
  'Entries with the outcome "throws" (0):',
  '',
  'Entries that agree with one of several outputs (1):',
  '',
  'symbols-a: 6 ft (height)',
]);

/** Facts with no change, for one case to change. */
function facts(change: Partial<Facts> = {}): Facts {
  return {
    results: { changed: [], added: 0, removed: 0 },
    corpus: { outcomes: [], edited: [], removed: [], added: 0, rows: [] },
    examples: { removed: [], added: [] },
    snapshotTestChanged: false,
    apiChanged: false,
    packageChanged: false,
    consumerFields: [],
    deletedTests: [],
    loweredLimits: [],
    settingsChanged: false,
    ignores: [],
    ciChanged: [],
    removedExpects: 0,
    sizeRaises: [],
    removedBudgets: [],
    codeChanged: [],
    sizes: [],
    ...change,
  };
}

describe('result snapshot changes', () => {
  it('reads each line by its input and option set', () => {
    const results = parseResults('5 ft\t-\t5 ft height\n5 ft\th\t5 ft height\nnot a line\n');
    expect([...results]).toEqual([
      ['5 ft\t-', '5 ft height'],
      ['5 ft\th', '5 ft height'],
    ]);
  });

  it('lists a changed result and counts inputs that only one side has', () => {
    const base = parseResults('a\t-\tnull\nb\t-\t5 ft height\nc\t-\tnull\n');
    const head = parseResults('a\t-\t1 ft height\nb\t-\t5 ft height\nd\t-\tnull\n');
    expect(resultChanges(base, head)).toEqual({
      changed: [{ input: 'a', options: '-', before: 'null', after: '1 ft height' }],
      added: 1,
      removed: 1,
    });
  });
});

describe('corpus changes', () => {
  it('reads the score rows and the outcome of each listed entry', () => {
    const { rows, outcomes } = parseCorpusReport(BASE_REPORT);
    expect([...rows]).toEqual([
      ['all', '3 1 1 1 0'],
      ['symbols', '3 1 1 1 0'],
    ]);
    expect([...outcomes]).toEqual([
      ['symbols-b', 'wrong: 5 ft (height)'],
      ['symbols-c', 'missed: null'],
      ['symbols-a', 'agree: 6 ft (height)'],
    ]);
  });

  it('reads nothing from a file without the report', () => {
    expect(parseCorpusReport(null)).toEqual({ rows: new Map(), outcomes: new Map() });
  });

  it('keeps only what an entry expects', () => {
    const line = (source: string): string =>
      `{"id":"a","input":"6 ft","expected":null,"category":"symbols","source":"${source}"}`;
    expect(parseCorpus(line('handwritten'))).toEqual(parseCorpus(line('AFA-1')));
    expect(parseCorpus(`${line('AFA-1')}\n\n`).get('a')).toBe('["6 ft",null,null]');
  });

  it('lists changed outcomes, edited and removed entries, new entries and changed rows', () => {
    const entry = (id: string, expected: string): string =>
      `{"id":"${id}","input":"x","expected":${expected},"category":"symbols","source":"handwritten"}`;
    const base = {
      entries: parseCorpus([entry('a', 'null'), entry('b', 'null'), entry('c', 'null')].join('\n')),
      report: parseCorpusReport(
        report([
          'Category                 total   agree   wrong  missed  throws',
          'all                          3       1       1       1       0',
          '',
          'symbols                      3       1       1       1       0',
          '',
          'Entries with the outcome "wrong" (1):',
          '',
          'b (symbols)',
          '  actual:   5 ft (height)',
          '',
          'Entries with the outcome "missed" (1):',
          '',
          'c (symbols)',
          '  actual:   null',
        ])
      ),
    };
    const head = {
      entries: parseCorpus(
        [
          entry('a', 'null'),
          entry('b', '{"value":1,"unit":"ft","type":"height"}'),
          entry('d', 'null'),
        ].join('\n')
      ),
      report: parseCorpusReport(
        report([
          'Category                 total   agree   wrong  missed  throws',
          'all                          3       2       1       0       0',
          '',
          'symbols                      3       2       1       0       0',
          '',
          'Entries with the outcome "wrong" (1):',
          '',
          'a (symbols)',
          '  actual:   1 ft (height)',
        ])
      ),
    };
    expect(corpusChanges(base, head)).toEqual({
      outcomes: [
        { id: 'a', before: 'agree', after: 'wrong: 1 ft (height)' },
        { id: 'b', before: 'wrong: 5 ft (height)', after: 'agree' },
      ],
      edited: ['b'],
      removed: ['c'],
      added: 1,
      rows: [
        { name: 'all', before: '3 1 1 1 0', after: '3 2 1 0 0' },
        { name: 'symbols', before: '3 1 1 1 0', after: '3 2 1 0 0' },
      ],
    });
  });
});

describe('example changes', () => {
  const markdown = [
    '```bash',
    'npm install @afahy/fluent-measures',
    '```',
    '',
    '```typescript',
    "parseMeasurement('6 ft');",
    '// { value: 6 }  ',
    '',
    '```',
  ].join('\n');

  it('reads the lines of the code blocks that call parseMeasurement', () => {
    expect(exampleLines(markdown)).toEqual(["parseMeasurement('6 ft');", '// { value: 6 }']);
    expect(exampleLines(null)).toEqual([]);
  });

  it('reads each paragraph of text that has a code span as one example', () => {
    const text = [
      '# Title with `code`',
      '',
      'Plain text with no code.',
      '',
      'For example, `12st 4lb` and `7 lb 8 oz`',
      'return `null`.',
      '',
      '```bash',
      'pnpm add `x`',
      '```',
    ].join('\n');
    expect(exampleLines(text)).toEqual(['For example, `12st 4lb` and `7 lb 8 oz` return `null`.']);
    // A new line break in a paragraph changes no example, but a changed word does.
    const rewrapped = text.replace('`7 lb 8 oz`\nreturn', '`7 lb 8 oz` return');
    expect(exampleChanges(exampleLines(text), exampleLines(rewrapped))).toEqual({
      removed: [],
      added: [],
    });
    const changed = text.replace('return `null`', 'return 4 lb');
    expect(exampleChanges(exampleLines(text), exampleLines(changed))).toEqual({
      removed: ['For example, `12st 4lb` and `7 lb 8 oz` return `null`.'],
      added: ['For example, `12st 4lb` and `7 lb 8 oz` return 4 lb.'],
    });
  });

  it('lists the removed and added lines, also for a repeated line', () => {
    expect(exampleChanges(['a', 'b', 'b'], ['b', 'c'])).toEqual({
      removed: ['a', 'b'],
      added: ['c'],
    });
    expect(exampleChanges(['a', 'b'], ['b', 'a'])).toEqual({ removed: [], added: [] });
  });
});

describe('package and limit changes', () => {
  it('lists only the package.json fields that reach users', () => {
    const base = JSON.stringify({ exports: { '.': './a.js' }, devDependencies: { x: '1' } });
    const head = JSON.stringify({ exports: { '.': './b.js' }, devDependencies: { x: '2' } });
    expect(consumerFieldChanges(base, head)).toEqual(['exports']);
    expect(consumerFieldChanges(null, JSON.stringify({ dependencies: { x: '1' } }))).toEqual([
      'dependencies',
    ]);
  });

  it('reads the size budget of each file in kB', () => {
    const text =
      '[{ path: \'dist/a.js\', limit: \'5 kB\' }, { limit: "5.5 kB", path: "dist/b.js" }, {}]';
    expect([...sizeLimits(text)]).toEqual([
      ['dist/a.js', 5],
      ['dist/b.js', 5.5],
    ]);
    expect([...sizeLimits(null)]).toEqual([]);
  });

  it('pairs the size budgets by file', () => {
    const base = new Map([
      ['dist/a.js', 5],
      ['dist/b.js', 5],
    ]);
    const head = new Map([
      ['dist/new.js', 2],
      ['dist/b.js', 7],
    ]);
    expect(sizeChanges(base, head)).toEqual({ raises: [0, 2], removed: ['dist/a.js'] });
  });

  it('compares the test settings without their limits', () => {
    const files = (
      mutate: string,
      limit: number,
      exclude: string,
      lines: number
    ): Record<string, string> => ({
      'stryker.config.json': JSON.stringify({ mutate: [mutate], thresholds: { break: limit } }),
      'vitest.config.ts': `coverage: { exclude: [${exclude}],\n thresholds: { lines: ${lines} } }`,
      'package.json': JSON.stringify({ version: '1.0.0', scripts: { test: 'vitest run' } }),
    });
    const base = testSettings(files('src/**', 98, "'dist/**'", 100));
    expect(testSettings(files('src/**', 99, "'dist/**'", 90))).toBe(base);
    expect(testSettings(files('src/units.ts', 98, "'dist/**'", 100))).not.toBe(base);
    expect(testSettings(files('src/**', 98, "'dist/**', 'src/units.ts'", 100))).not.toBe(base);
    // Only the scripts of package.json count, and blank space in another file doesn't.
    const other = { ...files('src/**', 98, "'dist/**'", 100) };
    other['package.json'] = JSON.stringify({ version: '2.0.0', scripts: { test: 'vitest run' } });
    expect(testSettings(other)).toBe(base);
    other['package.json'] = JSON.stringify({ scripts: { test: 'vitest run --bail' } });
    expect(testSettings(other)).not.toBe(base);
    const lint = { 'eslint.config.js': "rules: { 'a': 'error' }" };
    expect(testSettings({ ...lint, 'eslint.config.js': "rules: {\n  'a': 'error' }" })).toBe(
      testSettings(lint)
    );
    expect(testSettings({ 'eslint.config.js': "rules: { 'a': 'off' }" })).not.toBe(
      testSettings(lint)
    );
    expect(testSettings({})).toBe(testSettings({ 'tsconfig.json': null }));
  });

  it('counts the expect calls that a diff of the tests removes, less the added ones', () => {
    const diff = [
      '--- a/tests/a.test.ts',
      '+++ b/tests/a.test.ts',
      "-    expect(parse('6 ft')).toBe(6);",
      "-    expect(parse('7 ft')).toBe(7);",
      '-    expectTypeOf(parse).toBeFunction();',
      "+    expect(parse('6 ft')).toEqual(6);",
      '-    const expected = 1;',
    ].join('\n');
    expect(removedExpects(diff)).toBe(2);
    expect(removedExpects('+    expect(a).toBe(1);\n+    expect(b).toBe(2);')).toBe(0);
  });

  it('lists deleted tests and tests renamed to a name that Vitest skips', () => {
    expect(
      deletedTests([
        { kind: 'D', path: 'tests/a.test.ts' },
        { kind: 'D', path: 'tests/helper.ts' },
        { kind: 'R', path: 'tests/b.test.ts', to: 'tests/b.ts' },
        { kind: 'R', path: 'tests/b.ts' },
        { kind: 'R', path: 'tests/c.test.ts', to: 'tests/d.test.ts' },
        { kind: 'R', path: 'tests/d.test.ts' },
        { kind: 'M', path: 'tests/e.test.ts' },
      ])
    ).toEqual(['tests/a.test.ts', 'tests/b.test.ts (renamed to tests/b.ts)']);
  });

  it('finds added comments that turn off a check', () => {
    const diff = [
      '+++ b/src/units.ts',
      '+  // Stryker disable next-line StringLiteral: the same result',
      '-  /* v8 ignore next */',
      '+  /* v8 ignore next */',
      '+  /* c8 ignore start */',
      '+  /* istanbul ignore else */',
      '+  const x = 1;',
    ].join('\n');
    expect(addedIgnores(diff)).toEqual([
      '// Stryker disable next-line StringLiteral: the same result',
      '/* v8 ignore next */',
      '/* c8 ignore start */',
      '/* istanbul ignore else */',
    ]);
  });

  it('finds the scripts that workflows run, and what those scripts import', () => {
    const files: Record<string, string> = {
      '.github/scripts/a.mjs': "import { x } from './b.mjs';\nimport fs from 'node:fs';",
      '.github/scripts/b.mjs': "import { y } from './c.mjs';",
      '.github/scripts/c.mjs': "import { x } from './b.mjs';",
      '.github/scripts/other.mjs': '',
    };
    const workflows = ['run: node .github/scripts/a.mjs', 'run: node .github/scripts/missing.mjs'];
    expect([...scriptsRun(workflows, path => files[path] ?? null)].sort()).toEqual([
      '.github/scripts/a.mjs',
      '.github/scripts/b.mjs',
      '.github/scripts/c.mjs',
      '.github/scripts/missing.mjs',
    ]);
  });

  it('reads the status of each changed path, with both paths of a rename', () => {
    const output = [
      'M',
      'src/a.ts',
      'R087',
      'tests/old.test.ts',
      'tests/new.test.ts',
      'D',
      'M',
      '',
    ].join('\0');
    expect(nameStatus(output)).toEqual([
      { kind: 'M', path: 'src/a.ts' },
      { kind: 'R', path: 'tests/old.test.ts', to: 'tests/new.test.ts' },
      { kind: 'R', path: 'tests/new.test.ts' },
      { kind: 'D', path: 'M' },
    ]);
    expect(nameStatus('')).toEqual([]);
  });

  it('reads the mutation and coverage limits', () => {
    const vitest = 'coverage: { thresholds: {\n branches: 100,\n lines: 99.5,\n } }';
    expect([...testLimits('{"thresholds":{"break":99}}', vitest)]).toEqual([
      ['mutation score', 99],
      ['branches coverage', 100],
      ['lines coverage', 99.5],
    ]);
    expect([...testLimits(null, null)]).toEqual([]);
  });
});

describe('listsChangedResults', () => {
  it.each([
    ['a heading', '## Description\n\n### Changed results\n\n- a', true],
    ['a line', 'Changed results: only the ones that AFA-1 asks for.', true],
    ['a bold line', '**Changed results**\n- a', true],
    ['a list item', '- Changed results: only what AFA-1 asks for', true],
    ['a bold list item', '- **Changed results:** none beyond AFA-1', true],
    ['a list item with a star', '* Changed results\n  - a', true],
    ['a numbered item', '1. Changed results: none beyond AFA-1', true],
    ['an underscored line', '__Changed results__\n\n1. a', true],
    ['an italic line', '*Changed results:* none', true],
    ['no list', 'This changes some results.', false],
    ['words in a sentence', 'It lists the changed results below.', false],
    ['an empty body', '', false],
    ['an empty heading', '# Description\n\n### Changed results\n\n## Type of change\n', false],
    ['a marker with only a colon', '**Changed results:**\n\nSee the tests.', false],
    [
      'a list after "Type of change"',
      '# Description\n\nText.\n\n## Type of change\n\nChanged results: a',
      false,
    ],
    [
      'the template with a list',
      '# Description\n\nText.\n\nChanged results:\n\n- a\n\nFixes AFA-1\n\n## Type of change\n',
      true,
    ],
    // github.com saves an edited body with CRLF line endings.
    ['a line with CRLF', '# Description\r\n\r\nChanged results: none beyond AFA-1\r\n', true],
    ['a heading with CRLF', '## Changed results\r\n\r\n- a\r\n', true],
    ['a bold list item with CRLF', '- **Changed results:** none\r\n', true],
    [
      'a table under a heading',
      '### Changed results\n\n| Input | main | This PR |\n| --- | --- | --- |\n| `5 ft` | a | b |\n',
      true,
    ],
  ])('finds %s', (_, body, found) => {
    expect(listsChangedResults(body)).toBe(found);
  });
});

describe('changedResults', () => {
  const outcome = (id: string) => ({ id, before: 'wrong: 5.11 ft (height)', after: 'agree' });

  it('counts the changed snapshot lines and the outcomes of entries that the PR keeps', () => {
    const changed = [{ input: '5 ft', options: '-', before: '5 ft height', after: '60 in height' }];
    const corpus = { ...facts().corpus, outcomes: [outcome('a'), outcome('b')] };
    expect(changedResults(facts({ results: { changed, added: 0, removed: 0 }, corpus }))).toBe(3);
  });

  it("doesn't count the outcome of an entry that the PR edits", () => {
    // Adding a second expected output to decimals-5-11-ft changes its outcome, not a result.
    const corpus = {
      ...facts().corpus,
      outcomes: [outcome('decimals-5-11-ft')],
      edited: ['decimals-5-11-ft'],
    };
    expect(changedResults(facts({ corpus }))).toBe(0);
  });
});

describe('assessRisk', () => {
  it('rates a change to no code and no result low', () => {
    expect(assessRisk(facts())).toEqual({
      level: 'low',
      reasons: ['It changes no code that runs and no result.'],
    });
  });

  it('rates removed expect calls medium', () => {
    expect(assessRisk(facts({ removedExpects: 3 }))).toEqual({
      level: 'medium',
      reasons: ['It removes 3 expect calls from the tests.'],
    });
  });

  it('rates an added ignore comment medium', () => {
    expect(assessRisk(facts({ ignores: ['/* v8 ignore next */'] }))).toEqual({
      level: 'medium',
      reasons: ['It adds 1 comments that turn off a mutation or coverage check.'],
    });
  });

  it('rates a changed result or changed code medium', () => {
    const change = { input: 'a', options: '-', before: 'null', after: '1 ft height' };
    expect(
      assessRisk(
        facts({
          results: { changed: [change], added: 0, removed: 0 },
          corpus: {
            ...facts().corpus,
            outcomes: [{ id: 'a', before: 'agree', after: 'missed: null' }],
          },
          codeChanged: ['src/units.ts'],
        })
      )
    ).toEqual({
      level: 'medium',
      reasons: ['It changes 2 results.', 'It changes code that runs: src/units.ts.'],
    });
  });

  it('rates a size raise of 0.5 kB medium and a larger raise high', () => {
    expect(assessRisk(facts({ sizeRaises: [0.5, 0] }))).toEqual({
      level: 'medium',
      reasons: ['It raises a size budget by 0.5 kB.'],
    });
    expect(assessRisk(facts({ sizeRaises: [1] })).level).toBe('high');
    expect(assessRisk(facts({ sizeRaises: [-1] })).level).toBe('low');
  });

  it.each<[string, Partial<Facts>, string]>([
    [
      'a changed example',
      { examples: { removed: ['a'], added: [] } },
      'It changes an example in README.md or PARSING.md, the public specification.',
    ],
    ['a changed type', { apiChanged: true }, 'It changes an exported type (api-report.d.ts).'],
    [
      'a changed package field',
      { consumerFields: ['exports', 'files'] },
      'It changes package.json fields that reach users: exports, files.',
    ],
    [
      'an edited corpus entry',
      { corpus: { ...facts().corpus, edited: ['a'] } },
      'It edits or removes a corpus entry, which changes an expected output.',
    ],
    ['a deleted test', { deletedTests: ['tests/a.test.ts'] }, 'It deletes tests: tests/a.test.ts.'],
    [
      'a lowered limit',
      { loweredLimits: ['mutation score from 99 to 70'] },
      'It lowers a test limit: mutation score from 99 to 70.',
    ],
    [
      'a change to CI',
      { ciChanged: ['.github/workflows/ci.yml', '.github/scripts/pr-state.mjs'] },
      'It changes CI, a workflow or a script that a workflow runs: .github/workflows/ci.yml, .github/scripts/pr-state.mjs.',
    ],
    [
      'changed test settings',
      { settingsChanged: true },
      'It changes which tests run, or what coverage or mutation testing counts.',
    ],
    [
      'a removed size budget',
      { removedBudgets: ['dist/index.js'] },
      'It removes a size budget: dist/index.js.',
    ],
  ])('rates %s high', (_, change, reason) => {
    expect(assessRisk(facts({ ...change, codeChanged: ['src/units.ts'] }))).toEqual({
      level: 'high',
      reasons: [reason],
    });
  });
});

describe('summary', () => {
  it('shows the risk, escapes table cells and pairs the sizes', () => {
    const text = summary(
      facts({
        results: {
          changed: [{ input: 'a|<b>', options: '-', before: 'null', after: '1 ft height' }],
          added: 2,
          removed: 0,
        },
        sizes: sizes(
          '[{"name":"dist/index.js","size":100}]',
          '[{"name":"dist/index.js","size":110},{"name":"dist/new.js","size":5}]'
        ),
        snapshotTestChanged: true,
      }),
      { level: 'medium', reasons: ['It changes 1 results.'] }
    );
    expect(text).toContain('Risk: **medium**\n\n- It changes 1 results.\n');
    expect(text).toContain(
      '| <code>a&#124;&lt;b&gt;</code> | <code>-</code> | <code>null</code> | <code>1 ft height</code> |'
    );
    expect(text).toContain('The generated inputs changed: 2 added and 0 removed.');
    expect(text).toContain('The PR changes `tests/resultSnapshot.test.ts`');
    expect(text).toContain('| <code>dist/index.js</code> | 100 B | 110 B | +10 B |');
    expect(text).toContain('| <code>dist/new.js</code> |  | 5 B |  |');
  });

  it("says what didn't change", () => {
    const text = summary(facts(), { level: 'low', reasons: [] });
    expect(text).toContain('No result in `tests/__snapshots__/resultSnapshot.txt` changed.');
    expect(text).toContain('No example changed.');
    expect(text).toContain("`api-report.d.ts` didn't change.");
    expect(text).toContain("The PR doesn't change the package files, so the sizes didn't change.");
    expect(sizes(null, null)).toEqual([]);
    expect(summary(facts({ packageChanged: true }), { level: 'medium', reasons: [] })).toContain(
      'The sizes are missing. The step that measures them says why.'
    );
    expect(sizes('', 'not JSON')).toEqual([]);
    expect(sizes('{}', '[{"name":"dist/index.js","size":1}]')).toEqual([
      { name: 'dist/index.js', before: null, after: 1 },
    ]);
  });

  it('leaves out the changes after the first 100', () => {
    const changed = Array.from({ length: 102 }, (_, index) => ({
      input: String(index),
      options: '-',
      before: 'null',
      after: '1 ft height',
    }));
    const text = summary(facts({ results: { changed, added: 0, removed: 0 } }), {
      level: 'medium',
      reasons: [],
    });
    expect(text).toContain('<code>99</code>');
    expect(text).not.toContain('<code>100</code>');
    expect(text).toContain('The summary leaves out 2 more.');
  });
});
