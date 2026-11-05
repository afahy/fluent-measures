import { Buffer } from 'node:buffer';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { execPath } from 'node:process';
import { afterEach, describe, expect, it } from 'vitest';
import { git, withoutGitRepository } from './gitEnvironment';

const script = resolve('.github/scripts/regression-check.mjs');
const directories: string[] = [];
const before = 'export const double = (value: number) => value;\n';
const after = 'export const double = (value: number) => value * 2;\n';

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function createRepository(): string {
  const repository = mkdtempSync(resolve(tmpdir(), 'fluent-measures-regression-'));
  directories.push(repository);
  git(repository, 'init', '--initial-branch', 'main');
  git(repository, 'config', 'user.email', 'test@example.com');
  git(repository, 'config', 'user.name', 'Test');
  git(repository, 'config', 'commit.gpgsign', 'false');
  git(repository, 'config', 'core.hooksPath', '/dev/null');
  git(repository, 'config', 'core.quotePath', 'true');
  // Run the installed TypeScript and Vitest, including real test discovery and JSON reporting.
  symlinkSync(resolve('node_modules'), resolve(repository, 'node_modules'), 'dir');
  writeFiles(repository, {
    '.gitignore': 'node_modules/\nactions.log\noutput.txt\n',
    'package.json': '{"type":"module"}\n',
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        skipLibCheck: true,
        strict: true,
        allowImportingTsExtensions: true,
        types: ['node'],
      },
      include: ['src', 'tests'],
    }),
    'vitest.config.mjs':
      'export default { test: { include: ["tests/**/*.test.ts"], maxWorkers: 1 } };\n',
  });
  return repository;
}

function writeFiles(repository: string, files: Record<string, string>): void {
  for (const [file, contents] of Object.entries(files)) {
    mkdirSync(dirname(resolve(repository, file)), { recursive: true });
    writeFileSync(resolve(repository, file), contents);
  }
}

function commitFiles(repository: string, files: Record<string, string>): void {
  writeFiles(repository, files);
  git(repository, 'add', '--all');
  git(repository, 'commit', '-m', 'test: fixture change');
}

function testSource(source = 'src/units.ts', expected = 4): string {
  return `import { expect, it } from 'vitest';
import { double } from ${JSON.stringify('../' + source)};
it('doubles two', () => { expect(double(2)).toBe(${expected}); });\n`;
}

function runCheck(repository: string): { status: number | null; log: string; output: string } {
  const output = resolve(repository, 'output.txt');
  writeFileSync(output, '');
  const log = resolve(repository, 'actions.log');
  // Both streams use the same descriptor, preserving the workflow's order of log lines.
  const descriptor = openSync(log, 'w');
  let status;
  try {
    ({ status } = spawnSync(execPath, [script], {
      cwd: repository,
      stdio: ['ignore', descriptor, descriptor],
      env: {
        ...withoutGitRepository(),
        GITHUB_OUTPUT: output,
        GITHUB_ACTIONS: 'true',
        TMPDIR: repository,
      },
    }));
  } finally {
    closeSync(descriptor);
  }
  return { status, log: readFileSync(log, 'utf8'), output: readFileSync(output, 'utf8') };
}

// GitHub parses V2 commands after leading whitespace and legacy ##[...] commands anywhere.
// While stopped it ignores either syntax, except the command that resumes the exact token.
function activeCommands(log: string): string[] {
  let stopped: string | undefined;
  const commands: string[] = [];
  for (const line of log.split(/\r?\n/)) {
    const command =
      /^::([^ :]+)(?: [^:]*)?::(.*)$/.exec(line.trimStart()) ??
      /##\[([^ \]]+)(?: [^\]]*)?\](.*)$/.exec(line);
    if (command === null) continue;
    if (stopped !== undefined) {
      if (command[1] === stopped) stopped = undefined;
    } else if (command[1].toLowerCase() === 'stop-commands') {
      stopped = command[2];
    } else {
      commands.push(line);
    }
  }
  if (stopped !== undefined) commands.push('commands were never resumed');
  return commands;
}

describe('regression-check.mjs', () => {
  // AFA-128: git C-quotes these names without -z. The base source must actually be restored.
  it.each(['src/é.ts', 'src/a"b.ts', 'src/a\nb.ts'])(
    'catches a regression in the changed source %j',
    source => {
      const repository = createRepository();
      commitFiles(repository, { [source]: before });
      commitFiles(repository, { [source]: after, 'tests/units.test.ts': testSource(source) });

      const check = runCheck(repository);

      expect(check.status).toBe(0);
      expect(check.output).toBe('result=caught\n');
      expect(readFileSync(resolve(repository, source), 'utf8')).toBe(before);
      expect(check.log).toContain('doubles two');
    }
  );

  it.each(['tests/é.test.ts', 'tests/a"b.test.ts', 'tests/a\nb.test.ts'])(
    'runs the changed test %j against the base source',
    test => {
      const repository = createRepository();
      commitFiles(repository, { 'src/units.ts': before });
      commitFiles(repository, { 'src/units.ts': after, [test]: testSource() });

      const check = runCheck(repository);

      expect(check.status).toBe(0);
      expect(check.output).toBe('result=caught\n');
      expect(check.log).toContain('doubles two');
    }
  );

  it('removes an added source whose Git name would be quoted', () => {
    const repository = createRepository();
    commitFiles(repository, { 'src/units.ts': before });
    commitFiles(repository, {
      'src/é.ts': after,
      'tests/added.test.ts': `import { existsSync } from 'node:fs';
import { expect, it } from 'vitest';
it('adds the source', () => { expect(existsSync('src/é.ts')).toBe(true); });\n`,
    });

    const check = runCheck(repository);

    expect(check.status).toBe(0);
    expect(check.output).toBe('result=caught\n');
    expect(existsSync(resolve(repository, 'src/é.ts'))).toBe(false);
  });

  it('fails closed instead of dropping a source name that is not valid UTF-8', () => {
    const repository = createRepository();
    commitFiles(repository, { 'src/units.ts': before });
    const env = withoutGitRepository();
    const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], {
      cwd: repository,
      input: after,
      encoding: 'utf8',
      env,
    }).trim();
    // Git plumbing also works on file systems that reject names containing invalid UTF-8.
    const entry = Buffer.concat([
      Buffer.from(`100644 ${blob}\tsrc/`),
      Buffer.from([0xff]),
      Buffer.from('\n::warning::fake\n.ts\0'),
    ]);
    execFileSync('git', ['update-index', '-z', '--index-info'], {
      cwd: repository,
      input: entry,
      env,
    });
    git(repository, 'commit', '-m', 'test: add an invalid path');

    const check = runCheck(repository);

    expect(check.status).toBe(1);
    expect(check.output).toBe('');
    expect(check.log).toContain("names aren't valid UTF-8");
    expect(activeCommands(check.log)).toEqual([]);
  });

  it.each([
    ['unchanged', before + '// a comment\n', undefined],
    ['no-tests', after, undefined],
    ['caught', after, testSource()],
    ['not-caught', after, testSource('src/units.ts', 2)],
  ] as const)('preserves the ordinary %s result', (result, source, test) => {
    const repository = createRepository();
    commitFiles(repository, { 'src/units.ts': before });
    commitFiles(repository, {
      'src/units.ts': source,
      ...(test === undefined ? {} : { 'tests/units.test.ts': test }),
    });

    const check = runCheck(repository);

    expect(check.status).toBe(0);
    expect(check.output).toBe(`result=${result}\n`);
    // The workflow can run this again on Node 24 after the first run restored the source.
    expect(runCheck(repository).output).toBe(`result=${result}\n`);
  });

  // AFA-128: test names and both output streams can emit commands, including stop-commands.
  it.each([
    ['caught', 4, 'x\n::error file=src/units.ts::fake'],
    ['not-caught', 2, 'x\n::error file=src/units.ts::fake'],
    ['caught', 4, 'x ##[error]fake'],
    ['not-caught', 2, 'x ##[error]fake'],
  ] as const)(
    'protects child output and resumes commands after %s with %j and %j',
    (result, expected, title) => {
      const repository = createRepository();
      commitFiles(repository, { 'src/units.ts': before });
      commitFiles(repository, {
        'src/units.ts': after,
        'tests/units.test.ts': testSource('src/units.ts', expected)
          .replace("'doubles two'", JSON.stringify(title))
          .replace(
            'expect(double(2))',
            `process.stdout.write('x\\n::error file=src/units.ts::fake\\n');
process.stderr.write('::stop-commands::x\\n::x::\\n::warning::fake\\nlegacy ##[error]fake\\n');
expect(double(2))`
          ),
      });

      const check = runCheck(repository);

      expect(check.status).toBe(0);
      expect(check.output).toBe(`result=${result}\n`);
      expect(check.log).toContain('\n::error file=src/units.ts::fake\n');
      expect(check.log).toContain('\n::stop-commands::x\n');
      expect(check.log).toContain('legacy ##[error]fake');
      expect(activeCommands(check.log)).toEqual([]);
      expect(check.log).toMatch(/\n::stop-commands::([\w-]+)\n[\s\S]*\n::\1::\n/);
      const repeated = runCheck(repository);
      expect(repeated.status).toBe(0);
      expect(repeated.output).toBe(check.output);
      expect(activeCommands(repeated.log)).toEqual([]);
      expect(repeated.log.match(/\n::stop-commands::([\w-]+)\n/)?.[1]).not.toBe(
        check.log.match(/\n::stop-commands::([\w-]+)\n/)?.[1]
      );
    }
  );

  it('resumes commands when Vitest cannot write a report', () => {
    const repository = createRepository();
    commitFiles(repository, { 'src/units.ts': before });
    commitFiles(repository, {
      'src/units.ts': after,
      'tests/units.test.ts': testSource(),
      'vitest.config.mjs': 'process.stdout.write("last child text"); process.exit(2);\n',
    });

    const check = runCheck(repository);

    expect(check.status).toBe(1);
    expect(check.output).toBe('');
    expect(check.log).toContain('and no test report');
    expect(check.log).toMatch(/\n::stop-commands::([\w-]+)\n[\s\S]*\n::\1::\n/);
    expect(activeCommands(check.log)).toEqual([]);
  });

  it.each([
    ['x\n::error::fake\n', '::error::fake'],
    ['x ##[error]fake', '##\\[error]fake'],
    ['x ##[ErRoR]fake', '##\\[ErRoR]fake'],
  ])(
    'escapes captured TypeScript output when it reports a startup failure for %j',
    (input, rendered) => {
      const repository = createRepository();
      commitFiles(repository, { 'src/units.ts': before });
      commitFiles(repository, {
        'src/units.ts': after,
        'tests/units.test.ts': testSource(),
        'tsconfig.json': JSON.stringify({ compilerOptions: { types: [input] } }),
      });

      const check = runCheck(repository);

      expect(check.status).toBe(1);
      expect(check.output).toBe('');
      expect(check.log).toContain('tsc exited with status');
      expect(check.log).toContain(rendered);
      expect(activeCommands(check.log)).toEqual([]);
    }
  );
});
