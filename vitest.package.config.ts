import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { env } from 'node:process';
import { defineConfig } from 'vitest/config';

// Runs the tests of parseMeasurement's results against the built package, once through `import`
// and once through `require`, as a user of the package would load it. The tests import '../src',
// and an alias gives them the package in its place. FLUENT_MEASURES_PACKAGE_DIR names a project
// that has the package installed, such as the one that CI installs the packed tarball into.
// Without it, this repository reads its own build in dist/ by the package name.
const NAME = '@afahy/fluent-measures';
const project = resolve(env.FLUENT_MEASURES_PACKAGE_DIR ?? import.meta.dirname);
const from = join(project, 'package.json');
const manifest = createRequire(from).resolve(`${NAME}/package.json`);
const { exports } = JSON.parse(readFileSync(manifest, 'utf8')) as {
  exports: { '.': { import: { default: string } } };
};
const esmEntry = join(dirname(manifest), exports['.'].import.default);

// The tests of results. Each one imports parseMeasurement from '../src'.
const include = [
  'tests/corpus.test.ts',
  'tests/docsExamples.test.ts',
  'tests/invariants.test.ts',
  'tests/parseMeasurement*.test.ts',
  'tests/properties.test.ts',
  'tests/readme.test.ts',
  'tests/resultSnapshot.test.ts',
];
// This test spies on a module in src/, which the built package doesn't load.
const exclude = ['tests/parseMeasurement.numberWords.test.ts'];

const SOURCE = /^\.\.\/src$/;

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    expect: { requireAssertions: true },
    // A changed result must fail here, and never update a snapshot.
    update: false,
    projects: [
      {
        extends: true,
        resolve: { alias: [{ find: SOURCE, replacement: esmEntry }] },
        test: { name: 'esm', include, exclude },
      },
      {
        extends: true,
        resolve: {
          alias: [
            { find: SOURCE, replacement: resolve(import.meta.dirname, 'tests/package/cjs.ts') },
          ],
        },
        test: { name: 'cjs', include, exclude, env: { FLUENT_MEASURES_FROM: from } },
      },
    ],
  },
});
