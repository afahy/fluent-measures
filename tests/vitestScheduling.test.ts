import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { withoutGitRepository } from './gitEnvironment';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('Vitest file scheduling', () => {
  // AFA-210: outer process-heavy files can overlap each other, and the Git-isolation file can
  // start a second worker pool alongside them. Exercise the real config at both levels. The
  // fixtures take exclusive slots, so overlap fails without deliberately causing a five-second
  // timeout. This detects scheduling, not CPU exhaustion. Check the nested selection separately
  // too, so a competing outer file cannot prevent us from testing the second worker pool.
  it.each([
    {
      selection: 'outer',
      completed: [
        'nested-evidenceReplay.test.ts',
        'nested-mutationCheck.test.ts',
        'outer-evidenceReplay.test.ts',
        'outer-gitEnvironment.test.ts',
        'outer-mutationCheck.test.ts',
      ],
    },
    {
      selection: 'nested',
      completed: ['nested-evidenceReplay.test.ts', 'nested-mutationCheck.test.ts'],
    },
  ])(
    'runs $selection files without competing worker pools',
    { timeout: 30_000 },
    ({ selection, completed }) => {
      const root = realpathSync(mkdtempSync(join(tmpdir(), 'fluent-measures-scheduling-')));
      directories.push(root);
      writeFileSync(join(root, 'package.json'), '{"type":"module"}');
      copyFileSync(new URL('../vitest.config.ts', import.meta.url), join(root, 'vitest.config.ts'));
      symlinkSync(
        fileURLToPath(new URL('../node_modules', import.meta.url)),
        join(root, 'node_modules'),
        'junction'
      );
      mkdirSync(join(root, 'completed'));
      for (const level of ['outer', 'nested']) {
        mkdirSync(join(root, 'tests', level), { recursive: true });
        for (const name of ['evidenceReplay', 'mutationCheck']) {
          copyFileSync(
            new URL('./fixtures/scheduling/worker.test.ts.txt', import.meta.url),
            join(root, 'tests', level, `${name}.test.ts`)
          );
        }
      }
      copyFileSync(
        new URL('./fixtures/scheduling/nested.test.ts.txt', import.meta.url),
        join(root, 'tests', 'outer', 'gitEnvironment.test.ts')
      );

      // The default CI invocation has no worker override. A cap inherited from the developer's
      // shell would hide this regression on main (and its nested runner would inherit it too).
      const env = withoutGitRepository();
      delete env.VITEST_MAX_WORKERS;
      const result = spawnSync(
        process.execPath,
        [
          fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url)),
          'run',
          `tests/${selection}`,
        ],
        { cwd: root, env: { ...env, CI: 'true' }, encoding: 'utf8', timeout: 20_000 }
      );
      const output = `${result.stdout}${result.stderr}`;
      expect(result.error, output).toBeUndefined();
      expect(result.status, output).toBe(0);
      // Every outer file and both nested files must actually finish; an empty selection cannot
      // satisfy the scheduling assertion by doing no work.
      expect(readdirSync(join(root, 'completed')).sort()).toEqual(completed);
    }
  );
});
