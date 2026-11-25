import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, matchesGlob, normalize } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { git, withoutGitRepository } from './gitEnvironment';

// On a pull request, CI's changes job skips the mutation and docs jobs when their inputs didn't
// change. GitHub runs it only in CI, so these tests read the workflow and run its scripts.
const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
const jobBlock = (name: string): string => {
  const start = ci.indexOf(`\n  ${name}:\n`);
  const end = ci.slice(start + 1).search(/\n {2}\S/);
  return ci.slice(start, end < 0 ? undefined : start + 1 + end);
};
const changesJob = jobBlock('changes');
const ciOkJob = jobBlock('ci-ok');
const runScript = (block: string): string =>
  (/^ +run: \|\n((?: {10}.*\n|\n)+)/m.exec(block)?.[1] ?? '').replace(/^ {10}/gm, '');
const inputs = (name: string): string[] =>
  (new RegExp(`^ +${name}: >-\\n((?: {12}\\S.*\\n)+)`, 'm').exec(changesJob)?.[1] ?? '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
const temporary = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'fluent-measures-changes-'));
  directories.push(directory);
  return directory;
};

/**
 * The files of the checkout at `root`, without dependencies, build output and reports. Paths are
 * relative to `root`.
 */
function repositoryFiles(directory = '.', root = '.'): string[] {
  const ignored = new Set([
    '.git',
    'node_modules',
    'dist',
    'build',
    'coverage',
    'reports',
    '.stryker-tmp',
    'docs-shots',
    '.docs-preview',
  ]);
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap(entry => {
    // A linked worktree's .git is a file, so leave out each ignored name, whatever its type.
    if (ignored.has(entry.name)) return [];
    const path = directory === '.' ? entry.name : join(directory, entry.name);
    if (entry.isDirectory()) return repositoryFiles(path, root);
    return entry.isFile() ? [path] : [];
  });
}

/**
 * The files of the checkout at `root` that git pathspecs select, from an empty copy of each
 * file.
 */
function selected(pathspecs: string[], root = '.'): Set<string> {
  const directory = temporary();
  for (const file of repositoryFiles('.', root)) {
    mkdirSync(join(directory, dirname(file)), { recursive: true });
    writeFileSync(join(directory, file), '');
  }
  git(directory, 'init', '--quiet');
  git(directory, 'add', '--all', '--force');
  return new Set(
    git(directory, 'ls-files', '-z', '--', ...pathspecs)
      .split('\0')
      .filter(Boolean)
  );
}

const matching = (files: string[], patterns: string[]): string[] =>
  files.filter(
    file =>
      patterns.some(pattern => !pattern.startsWith('!') && matchesGlob(file, pattern)) &&
      !patterns.some(pattern => pattern.startsWith('!') && matchesGlob(file, pattern.slice(1)))
  );

// In a standalone clone .git is a directory. In a linked worktree, as `git worktree add` makes it,
// .git is a file that names the repository. Neither is a file of the checkout.
describe('the copy of a checkout that selects job inputs', () => {
  const checkouts = (): Record<string, string> => {
    const clone = temporary();
    git(clone, 'init', '--quiet', '--initial-branch', 'main');
    git(clone, 'config', 'user.email', 'test@example.com');
    git(clone, 'config', 'user.name', 'Test');
    git(clone, 'config', 'commit.gpgsign', 'false');
    for (const file of ['src/parse.ts', 'docs/site.css', 'notes.txt']) {
      mkdirSync(join(clone, dirname(file)), { recursive: true });
      writeFileSync(join(clone, file), 'base\n');
    }
    git(clone, 'add', '--all');
    git(clone, 'commit', '--quiet', '-m', 'base');
    const worktree = join(temporary(), 'linked');
    git(clone, 'worktree', 'add', '--quiet', '--detach', worktree);
    return { 'a standalone clone': clone, 'a linked worktree': worktree };
  };

  it.each(['a standalone clone', 'a linked worktree'])('leaves out .git in %s', name => {
    const root = checkouts()[name];
    expect(repositoryFiles('.', root).sort()).toEqual([
      'docs/site.css',
      'notes.txt',
      'src/parse.ts',
    ]);
    expect(selected(['src', 'notes.txt'], root)).toEqual(new Set(['notes.txt', 'src/parse.ts']));
  });
});

describe('the inputs of the mutation and docs jobs', () => {
  it('gates the mutation and docs jobs on the changes job, before their steps start', () => {
    expect(jobBlock('mutation-inventory')).toMatch(
      /^\n {2}mutation-inventory:\n {4}needs: changes\n {4}if: needs\.changes\.outputs\.mutation == 'true'\n/
    );
    expect(jobBlock('docs')).toMatch(
      /^\n {2}docs:\n {4}needs: changes\n {4}if: needs\.changes\.outputs\.docs == 'true'\n/
    );
    // The other mutation jobs follow mutation-inventory, so they skip with it.
    expect(jobBlock('mutation')).toContain('\n    needs: mutation-inventory\n');
    expect(jobBlock('mutation-report')).toContain(
      "if: ${{ !cancelled() && needs.mutation-inventory.result == 'success' }}"
    );
  });

  // Each file that mutation-inventory hashes can change mutation results, and so can a test
  // file, which Stryker compares itself, and the source and build configuration.
  it('includes every file that can change mutation results', () => {
    const inventory = jobBlock('mutation-inventory');
    const hashed = (/hashFiles\(([^)]*)\)/.exec(inventory)?.[1] ?? '')
      .split(',')
      .map(pattern => pattern.trim().replace(/^'|'$/g, ''))
      .map(pattern =>
        pattern
          .replace('reports/mutation-cache/package.json', 'package.json')
          .replace('reports/mutation-cache/ci.yml', '.github/workflows/ci.yml')
      );
    expect(hashed).toContain('!tests/**/*.test.ts');
    const required = [
      ...hashed.filter(pattern => pattern !== '!tests/**/*.test.ts'),
      'src/**',
      'tsup.config.ts',
    ];
    const files = repositoryFiles();
    const expected = matching(files, required);
    expect(expected).toEqual(
      expect.arrayContaining([
        'src/index.ts',
        'tests/corpus.test.ts',
        'tests/corpus/measurements.jsonl',
        'package.json',
        'pnpm-lock.yaml',
        'stryker.config.json',
        'tsup.config.ts',
        '.github/scripts/mutation-inventory.mjs',
        '.github/workflows/ci.yml',
      ])
    );
    const covered = selected(inputs('MUTATION_INPUTS'));
    expect(expected.filter(file => !covered.has(file))).toEqual([]);
  });

  it('leaves out only the tooling fixtures that mutation-inventory leaves out', () => {
    const covered = selected(inputs('MUTATION_INPUTS'));
    const tests = repositoryFiles('tests');
    expect(
      tests
        .filter(file => !covered.has(file))
        .every(file => /^tests\/fixtures\/(?:pr-status|late-bot-findings|mutation)\//.test(file))
    ).toBe(true);
    expect(covered.has('tests/fixtures/pr-status/pr-43.json')).toBe(false);
  });

  // The docs job runs pnpm scripts. Each script that they import, the files that docs-build.mjs
  // publishes and the packages can change its result.
  it('includes every file that the docs job reads', () => {
    const docs = jobBlock('docs');
    const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    const commands = [...docs.matchAll(/^ +run: pnpm (\S+)/gm)].map(([, name]) => name);
    expect(commands).toEqual(['docs:audit', 'docs:sweep']);
    const queue = commands.map(name => /^node (\S+\.mjs)$/.exec(manifest.scripts[name])?.[1] ?? '');
    const scripts = new Set<string>();
    while (queue.length) {
      const file = normalize(queue.pop() ?? '');
      if (scripts.has(file)) continue;
      scripts.add(file);
      for (const [, path] of readFileSync(file, 'utf8').matchAll(/from '(\.[^']+)'/g))
        queue.push(join(dirname(file), path));
    }
    expect(scripts).toContain('.github/scripts/docs-build.mjs');
    expect(scripts).toContain('.github/scripts/docs-focus-order.mjs');
    const actions = [...docs.matchAll(/uses: \.\/(\S+)/g)].map(([, path]) => `${path}/action.yml`);
    const expected = [
      ...scripts,
      ...actions,
      ...repositoryFiles('docs'),
      'README.md',
      'PARSING.md',
      'package.json',
      'pnpm-lock.yaml',
      '.github/workflows/ci.yml',
    ];
    const covered = selected(inputs('DOCS_INPUTS'));
    expect(expected.filter(file => !covered.has(file))).toEqual([]);
  });
});

/** Runs the changes step on a pull request's merge commit, as CI checks it out. */
function changes(
  edit: (repository: string) => void,
  event = 'pull_request'
): Record<string, string> {
  const repository = temporary();
  const write = (file: string, content: string): void => {
    mkdirSync(join(repository, dirname(file)), { recursive: true });
    writeFileSync(join(repository, file), content);
  };
  git(repository, 'init', '--quiet', '--initial-branch', 'main');
  git(repository, 'config', 'user.email', 'test@example.com');
  git(repository, 'config', 'user.name', 'Test');
  git(repository, 'config', 'commit.gpgsign', 'false');
  for (const file of [
    'src/parse.ts',
    'docs/site.css',
    'README.md',
    'CONTRIBUTING.md',
    'tests/parse.test.ts',
    'tests/fixtures/pr-status/pr.json',
    '.github/scripts/pr-state.mjs',
    '.github/scripts/mutation-report.mjs',
    '.github/scripts/mutation-check.mjs',
    '.github/scripts/docs-sweep.mjs',
  ])
    write(file, 'base\n');
  git(repository, 'add', '--all');
  git(repository, 'commit', '--quiet', '-m', 'base');
  git(repository, 'switch', '--quiet', '-c', 'pr');
  edit(repository);
  git(repository, 'add', '--all');
  git(repository, 'commit', '--quiet', '--allow-empty', '-m', 'pr');
  git(repository, 'switch', '--quiet', 'main');
  // main moves on after the branch starts. The merge commit's diff from main leaves this out.
  write('src/main.ts', 'main\n');
  git(repository, 'add', '--all');
  git(repository, 'commit', '--quiet', '-m', 'main');
  git(repository, 'merge', '--quiet', '--no-ff', '-m', 'merge', 'pr');
  return runChanges(repository, event);
}

function runChanges(cwd: string, event: string): Record<string, string> {
  const output = join(cwd, '.git-output');
  writeFileSync(output, '');
  const env: Record<string, string | undefined> = {
    ...withoutGitRepository(),
    GITHUB_EVENT_NAME: event,
    GITHUB_OUTPUT: output,
  };
  for (const name of ['MUTATION_INPUTS', 'DOCS_INPUTS']) env[name] = inputs(name).join(' ');
  const result = spawnSync('bash', ['-e', '-c', runScript(changesJob)], {
    cwd,
    env,
    encoding: 'utf8',
  });
  expect(result.status).toBe(0);
  return Object.fromEntries(
    readFileSync(output, 'utf8')
      .trim()
      .split('\n')
      .map(line => line.split('='))
  );
}

const edit =
  (file: string, content = 'changed\n') =>
  (repository: string): void => {
    mkdirSync(join(repository, dirname(file)), { recursive: true });
    writeFileSync(join(repository, file), content);
  };

describe('the changes job', () => {
  it.each([
    ['a source file', edit('src/parse.ts'), 'true', 'false'],
    ['a new source file', edit('src/units/new.ts'), 'true', 'false'],
    ['a test file', edit('tests/parse.test.ts'), 'true', 'false'],
    ['a docs asset', edit('docs/site.css'), 'false', 'true'],
    ['a docs script', edit('.github/scripts/docs-sweep.mjs'), 'false', 'true'],
    ['the README, which both read', edit('README.md'), 'true', 'true'],
    ['an unrelated script', edit('.github/scripts/pr-state.mjs'), 'false', 'false'],
    ['a tooling fixture', edit('tests/fixtures/pr-status/pr.json'), 'false', 'false'],
    ['CONTRIBUTING.md', edit('CONTRIBUTING.md'), 'false', 'false'],
    ['nothing', () => {}, 'false', 'false'],
    [
      'a deleted mutation script',
      (repository: string) => unlinkSync(join(repository, '.github/scripts/mutation-report.mjs')),
      'true',
      'false',
    ],
  ])(
    'on a pull request that changes %s, runs mutation: %s, docs: %s',
    (_, change, mutation, docs) => {
      expect(changes(change)).toEqual({ mutation, docs });
    }
  );

  // A push to main runs neither job, also when it changes their inputs. nightly.yml calls ci.yml
  // on a schedule or by hand, and then the event name is the caller's. It runs both jobs, also
  // when no input changed and with no checkout.
  it('skips both jobs on a push, also when their inputs changed', () => {
    expect(changes(edit('src/parse.ts'), 'push')).toEqual({ mutation: 'false', docs: 'false' });
    expect(changes(edit('README.md'), 'push')).toEqual({ mutation: 'false', docs: 'false' });
    expect(runChanges(temporary(), 'push')).toEqual({ mutation: 'false', docs: 'false' });
  });

  it.each(['schedule', 'workflow_dispatch', 'workflow_call'])(
    'runs both jobs on a %s run, also when no input changed',
    event => {
      expect(changes(() => {}, event)).toEqual({ mutation: 'true', docs: 'true' });
      expect(runChanges(temporary(), event)).toEqual({ mutation: 'true', docs: 'true' });
    }
  );

  it("runs both jobs when git can't find the pull request base", () => {
    const repository = temporary();
    git(repository, 'init', '--quiet');
    git(repository, 'config', 'user.email', 'test@example.com');
    git(repository, 'config', 'user.name', 'Test');
    git(repository, 'config', 'commit.gpgsign', 'false');
    git(repository, 'commit', '--quiet', '--allow-empty', '-m', 'only');
    expect(runChanges(repository, 'pull_request')).toEqual({ mutation: 'true', docs: 'true' });
  });
});

type Result = 'success' | 'failure' | 'cancelled' | 'skipped';

/** Runs ci-ok's check with the given job results, and returns its exit status and output. */
function ciOk(
  ran: { mutation?: string; docs?: string },
  results: Partial<Record<string, Result>>
): { status: number | null; stdout: string } {
  const all: Record<string, Result> = {
    changes: 'success',
    test: 'success',
    package: 'success',
    'mutation-inventory': 'success',
    mutation: 'success',
    'mutation-report': 'success',
    docs: 'success',
    ...(results as Record<string, Result>),
  };
  const needs = Object.fromEntries(
    Object.entries(all).map(([job, result]) => [
      job,
      { result, outputs: job === 'changes' ? ran : {} },
    ])
  );
  const result = spawnSync('bash', ['-e', '-c', runScript(ciOkJob)], {
    env: { ...process.env, NEEDS: JSON.stringify(needs) },
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout };
}

const skippedMutation = {
  'mutation-inventory': 'skipped',
  mutation: 'skipped',
  'mutation-report': 'skipped',
} as const;

describe('ci-ok', () => {
  it('needs every other job in the workflow', () => {
    const jobs = [...ci.slice(ci.indexOf('\njobs:\n')).matchAll(/^ {2}([\w-]+):\n/gm)]
      .map(([, name]) => name)
      .filter(name => name !== 'ci-ok');
    const needs = /^ {4}needs: \[([^\]]*)\]/m.exec(ciOkJob)?.[1].split(', ');
    expect(needs?.sort()).toEqual(jobs.sort());
    expect(ciOkJob).toContain('\n    if: always()\n');
  });

  it('passes when every job passes', () => {
    expect(ciOk({ mutation: 'true', docs: 'true' }, {})).toEqual({ status: 0, stdout: '' });
  });

  it('passes when the changes job skipped the mutation and docs jobs', () => {
    expect(
      ciOk({ mutation: 'false', docs: 'false' }, { ...skippedMutation, docs: 'skipped' })
    ).toEqual({ status: 0, stdout: '' });
  });

  it.each([
    [
      'a mutation shard fails',
      { mutation: 'true', docs: 'false' },
      { mutation: 'failure', docs: 'skipped' },
      'mutation: failure\n',
    ],
    [
      'mutation-report fails',
      { mutation: 'true', docs: 'true' },
      { 'mutation-report': 'failure' },
      'mutation-report: failure\n',
    ],
    [
      'mutation-inventory fails and the shards skip',
      { mutation: 'true', docs: 'true' },
      { 'mutation-inventory': 'failure', mutation: 'skipped', 'mutation-report': 'skipped' },
      'mutation-inventory: failure\nmutation: skipped\nmutation-report: skipped\n',
    ],
    [
      'docs fails',
      { mutation: 'false', docs: 'true' },
      { ...skippedMutation, docs: 'failure' },
      'docs: failure\n',
    ],
    [
      'docs is skipped although it should run',
      { mutation: 'true', docs: 'true' },
      { docs: 'skipped' },
      'docs: skipped\n',
    ],
    [
      'the changes job fails',
      {},
      { changes: 'failure', ...skippedMutation, docs: 'skipped' },
      'changes: failure\nmutation-inventory: skipped\nmutation: skipped\nmutation-report: skipped\ndocs: skipped\n',
    ],
    [
      'test fails',
      { mutation: 'false', docs: 'false' },
      { test: 'failure', ...skippedMutation, docs: 'skipped' },
      'test: failure\n',
    ],
    [
      'package is cancelled',
      { mutation: 'true', docs: 'true' },
      { package: 'cancelled' },
      'package: cancelled\n',
    ],
  ] as const)('fails when %s', (_, ran, results, stdout) => {
    expect(ciOk(ran, results)).toEqual({ status: 1, stdout });
  });
});
