import tsParser from '@typescript-eslint/parser';
import { ESLint } from 'eslint';
import { readFileSync } from 'node:fs';
import { matchesGlob } from 'node:path';
import { describe, expect, it } from 'vitest';
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
  expect(scripts['lint:eslint:fix'].split(' ')).toContain('tests');
});

// The final review of #91: a JavaScript test gets the rule-11 checks but not `no-undef`, because
// Vitest's globals and Node's are defined at run time. The TypeScript formats get its parser.
describe('the lint config for each test format', () => {
  const eslint = new ESLint();

  it.each(['js', 'mjs', 'cjs', 'jsx'])('lints a .%s test that uses globals', async format => {
    const [result] = await eslint.lintText(
      "it('reads X', () => {\n  expect(process.env.X ?? 'x').toBe('x');\n});\n",
      { filePath: `tests/a/x.test.${format}` }
    );
    expect(result.messages).toEqual([]);
  });

  it.each(['js', 'mjs', 'cjs', 'jsx'])('finds a .%s test with no expect', async format => {
    const [result] = await eslint.lintText("it('does nothing', () => {});\n", {
      filePath: `tests/a/x.test.${format}`,
    });
    expect(result.messages.map(message => message.ruleId)).toEqual(['vitest/expect-expect']);
  });

  it.each(['ts', 'mts', 'cts', 'tsx'])('parses a .%s test as TypeScript', async format => {
    const config = (await eslint.calculateConfigForFile(`tests/a/x.test.${format}`)) as {
      languageOptions: { parser: unknown };
    };
    expect(config.languageOptions.parser).toBe(tsParser);
  });
});
