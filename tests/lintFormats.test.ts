import { readFileSync } from 'node:fs';
import { matchesGlob } from 'node:path';
import { expect, it } from 'vitest';
import vitestConfig from '../vitest.config';

type ConfigObject = { files?: string[]; plugins?: Record<string, unknown> };

// AFA-68: lint read only .ts tests, so a test in another format that Vitest runs could skip the
// rule-11 checks. Each format in Vitest's include must match the files of the block that holds
// the Vitest lint rules.
it('lints every test format that Vitest runs with the rule-11 checks', async () => {
  // A file name in a variable keeps TypeScript from looking for types of the plain JS config.
  const path = '../eslint.config.js';
  const { default: eslintConfig } = (await import(path)) as { default: ConfigObject[] };
  const vitestFiles = eslintConfig.find(block => block.plugins?.vitest)?.files ?? [];
  const formats = (vitestConfig.test?.include ?? []).flatMap(
    pattern => /\.\{([^}]*)\}$/.exec(pattern)?.[1].split(',') ?? []
  );
  expect(formats).toEqual(['js', 'mjs', 'cjs', 'ts', 'mts', 'cts', 'jsx', 'tsx']);
  const unlinted = formats.filter(
    format => !vitestFiles.some(glob => matchesGlob(`tests/a/x.test.${format}`, glob))
  );
  expect(unlinted).toEqual([]);
  // The lint script must read the whole tests/ folder, so the config's patterns decide.
  const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts as Record<
    string,
    string
  >;
  expect(scripts['lint:eslint'].split(' ')).toContain('tests');
});
