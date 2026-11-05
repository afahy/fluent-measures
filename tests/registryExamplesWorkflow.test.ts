import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/registry-examples.yml', 'utf8');
const directories: string[] = [];
// AFA-208 requires the installed version and checked-out main SHA, not the dispatch ref's SHA.
const main = 'c37308d0586332f593aec6df4704d11475e59a42';
const command =
  /^ {8}run: \|\n((?: {10}.*\n|\n)*)/m.exec(workflow)?.[1].replace(/^ {10}/gm, '') ?? '';
if (!command) throw new Error('The registry workflow must have an executable check step');

/** Runs the actual workflow shell with offline npm/pnpm/git stand-ins and real Node resolution. */
function run(
  testStatus = 0,
  installStatus = 0,
  version = '9.8.7'
): SpawnSyncReturns<string> & {
  root: string;
  project: string;
  calls: Record<string, unknown>[];
} {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'fluent-measures-registry-')));
  directories.push(root);
  const bin = join(root, 'bin');
  const runnerTemp = join(root, 'runner temp');
  mkdirSync(bin);
  mkdirSync(runnerTemp);
  const calls = join(root, 'calls.jsonl');
  const record = String.raw`
    const fs = require('node:fs');
    const args = process.argv.slice(2);
    fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify({
      tool: require('node:path').basename(process.argv[1]), args, cwd: process.cwd(),
      project: process.env.FLUENT_MEASURES_PACKAGE_DIR
    }) + '\n');
  `;
  const stubs = {
    git: String.raw`process.stdout.write('${main}\n');`,
    npm: `
      if (args[0] === 'init') {
        if (fs.readdirSync('.').length) throw new Error('Consumer project is not empty');
        fs.writeFileSync('package.json', '{}');
      } else if (args[0] === 'install') {
        if (${installStatus}) process.exit(${installStatus});
        fs.mkdirSync('node_modules/@afahy/fluent-measures', { recursive: true });
        fs.writeFileSync('node_modules/@afahy/fluent-measures/package.json',
          JSON.stringify({ version: ${JSON.stringify(version)} }));
      } else throw new Error('Unexpected npm command');
    `,
    pnpm: String.raw`process.stderr.write('example-test output\n'); process.exit(${testStatus});`,
  };
  for (const [name, body] of Object.entries(stubs)) {
    writeFileSync(join(bin, name), `#!${process.execPath}\n${record}\n${body}`, { mode: 0o755 });
  }
  const result = spawnSync(
    'bash',
    ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', command],
    {
      cwd: root,
      encoding: 'utf8',
      timeout: 10_000,
      env: {
        ...process.env,
        PATH: `${bin}${delimiter}${process.env.PATH}`,
        RUNNER_TEMP: runnerTemp,
        GITHUB_SHA: '1111111111111111111111111111111111111111',
      },
    }
  );
  return {
    ...result,
    root,
    project: join(runnerTemp, 'consumer'),
    calls: existsSync(calls)
      ? readFileSync(calls, 'utf8')
          .trim()
          .split('\n')
          .map(line => JSON.parse(line) as Record<string, unknown>)
      : [],
  };
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('registry example workflow', () => {
  it('checks main weekly and manually with read-only access and no secrets or PR triggers', () => {
    const triggers = /^on:\n([\s\S]*?)\npermissions:/m.exec(workflow)?.[1];
    expect(triggers).toBe("  schedule:\n    - cron: '31 6 * * 1'\n  workflow_dispatch:\n");
    expect(workflow).toMatch(/^permissions:\n {2}contents: read\n\njobs:/m);
    expect(workflow).toMatch(/^ {10}ref: main$/m);
    expect(workflow).toMatch(/^ {10}persist-credentials: false$/m);
    expect(workflow).not.toMatch(/secrets\.|\bneeds:/);
  });

  it('installs latest in an empty consumer and runs both existing example suites against it', () => {
    const result = run();
    expect(result.status, result.stderr).toBe(0);
    expect(result.calls).toEqual([
      { tool: 'git', args: ['rev-parse', 'HEAD'], cwd: result.root },
      { tool: 'npm', args: ['init', '--yes'], cwd: result.project },
      {
        tool: 'npm',
        args: [
          'install',
          '--ignore-scripts',
          '--no-audit',
          '--no-fund',
          '@afahy/fluent-measures@latest',
        ],
        cwd: result.project,
      },
      {
        tool: 'pnpm',
        args: ['test:package', 'tests/readme.test.ts', 'tests/docsExamples.test.ts'],
        cwd: result.root,
        project: result.project,
      },
    ]);
    expect(result.stdout).toContain(`@afahy/fluent-measures@9.8.7 against main ${main}`);
    expect(result.stdout).not.toContain('::error::');
  });

  it.each([1, 17])('fails and explains the release gap when the example tests exit %i', status => {
    const result = run(status, 0, '0.1.1');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('example-test output');
    expect(result.stdout).toContain(
      `::error::@afahy/fluent-measures@0.1.1 does not match the examples on main ${main}.`
    );
    expect(result.stdout).toContain(
      'Changes on main may not be released yet; a release matching main fixes that gap.'
    );
  });

  it('fails an unsuccessful install without running tests or claiming a release gap', () => {
    const result = run(0, 23);
    expect(result.status).toBe(23);
    expect(result.calls.map(call => call.tool)).toEqual(['git', 'npm', 'npm']);
    expect(result.stdout).not.toContain('::error::');
  });
});
