import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const directories: string[] = [];
const config = new URL('../vitest.package.config.ts', import.meta.url).href;

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

// The two package layouts: 0.1.1 has string exports and no package.json subpath; the current
// build has conditional exports. The chosen entries are fixture inputs, not code-derived results.
describe('package test configuration', () => {
  it.each([
    { label: '0.1.1', entry: './dist/index.mjs', exports: { '.': { import: './dist/index.mjs' } } },
    {
      label: 'current build',
      entry: './dist/index.js',
      exports: {
        '.': { import: { types: './dist/index.d.ts', default: './dist/index.js' } },
        './package.json': './package.json',
      },
    },
  ])('reads the $label ESM entry without requiring an exported manifest', fixture => {
    const project = realpathSync(mkdtempSync(join(tmpdir(), 'fluent-measures-package-config-')));
    directories.push(project);
    writeFileSync(join(project, 'package.json'), '{}');
    const packageRoot = join(project, 'node_modules/@afahy/fluent-measures');
    mkdirSync(join(packageRoot, 'dist'), { recursive: true });
    writeFileSync(
      join(packageRoot, 'package.json'),
      JSON.stringify({ name: '@afahy/fluent-measures', exports: fixture.exports })
    );
    writeFileSync(join(packageRoot, fixture.entry), 'export {};');
    const result = spawnSync(
      process.execPath,
      [
        '--experimental-strip-types',
        '--input-type=module',
        '-e',
        `const { default: config } = await import(${JSON.stringify(config)});
         process.stdout.write(JSON.stringify(config.test.projects));`,
      ],
      {
        encoding: 'utf8',
        timeout: 10_000,
        env: { ...process.env, FLUENT_MEASURES_PACKAGE_DIR: project },
      }
    );
    expect(result.status, result.stderr).toBe(0);
    const projects = JSON.parse(result.stdout);
    expect(projects[0].resolve.alias[0].replacement).toBe(join(packageRoot, fixture.entry));
    expect(projects[1].test.env.FLUENT_MEASURES_FROM).toBe(join(project, 'package.json'));
  });
});
