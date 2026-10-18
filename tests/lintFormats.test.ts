import tsParser from '@typescript-eslint/parser';
import { ESLint } from 'eslint';
import { readFileSync } from 'node:fs';
import { matchesGlob } from 'node:path';
import { describe, expect, it } from 'vitest';
import vitestConfig from '../vitest.config';

type ConfigObject = { files?: string[]; plugins?: Record<string, unknown> };

// The test formats that Vitest runs, from its include pattern. A TypeScript format has "ts" in its
// name, and the others are JavaScript. A format whose name ends in "x" can hold JSX.
const formats = (vitestConfig.test?.include ?? []).flatMap(
  pattern => /\.\{([^}]*)\}$/.exec(pattern)?.[1].split(',') ?? []
);
const tsFormats = formats.filter(format => format.includes('ts'));
const jsFormats = formats.filter(format => !format.includes('ts'));

// AFA-68: lint read only .ts tests, so a test in another format that Vitest runs could skip the
// rule-11 checks. Each format in Vitest's include must match the files of the block that holds
// the Vitest lint rules.
it('lints every test format that Vitest runs with the rule-11 checks', async () => {
  // A file name in a variable keeps TypeScript from looking for types of the plain JS config.
  const path = '../eslint.config.js';
  const { default: eslintConfig } = (await import(path)) as { default: ConfigObject[] };
  const vitestFiles = eslintConfig.find(block => block.plugins?.vitest)?.files ?? [];
  expect(formats).toEqual(['js', 'mjs', 'cjs', 'ts', 'mts', 'cts', 'jsx', 'tsx']);
  const unlinted = formats.filter(
    format => !vitestFiles.some(glob => matchesGlob(`tests/a/x.test.${format}`, glob))
  );
  expect(unlinted).toEqual([]);
});

// The lint scripts must read the whole tests/ folder, so the config's patterns decide which files
// it lints. Another word, such as `--ignore-pattern '**/*.mjs'`, could leave out a format.
it('lints all of src/ and tests/ in the lint scripts', () => {
  const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts as Record<
    string,
    string
  >;
  expect(scripts['lint:eslint'].split(' ')).toEqual(['eslint', 'src', 'tests']);
  expect(scripts['lint:eslint:fix'].split(' ')).toEqual(['eslint', 'src', 'tests', '--fix']);
});

// The final review of #91: each JavaScript format gets the rule-11 checks, and each TypeScript
// format gets TypeScript's parser. A test imports its globals in every format, as the repo's
// tests do, so `no-undef` stays on.
describe('the lint config for each test format', () => {
  const eslint = new ESLint();
  /**
   * The test's imports in each format. A .cjs file is CommonJS, so it uses require, and it can't
   * load Vitest, which is ESM only, so it uses Vitest's globals.
   */
  const imports = (format: string, vitestNames: string): string =>
    format === 'cjs'
      ? "const { env } = require('node:process');"
      : `import { env } from 'node:process';\nimport { ${vitestNames} } from 'vitest';`;

  it.each(jsFormats)('lints a .%s test that runs', async format => {
    const code = `${imports(format, 'expect, it')}\nit('reads X', () => {\n  expect(env.X ?? 'x').toBe('x');\n});\n`;
    const [result] = await eslint.lintText(code, { filePath: `tests/a/x.test.${format}` });
    expect(result.messages).toEqual([]);
  });

  it.each(jsFormats)('finds a .%s test with no expect', async format => {
    const code = `${imports(format, 'it')}\nit('does nothing', () => {\n  void env;\n});\n`;
    const [result] = await eslint.lintText(code, { filePath: `tests/a/x.test.${format}` });
    expect(result.messages.map(message => message.ruleId)).toEqual(['vitest/expect-expect']);
  });

  // `console` is a global in Node, so `no-undef` mustn't reject it. Then `no-console` allows a
  // test to warn, but not to log.
  it.each(jsFormats)('allows console.warn, but not console.log, in a .%s test', async format => {
    const code = `${imports(format, 'expect, it')}\nit('warns', () => {\n  console.warn('w');\n  console.log('l');\n  expect(env.X ?? 'x').toBe('x');\n});\n`;
    const [result] = await eslint.lintText(code, { filePath: `tests/a/x.test.${format}` });
    expect(result.messages.map(message => message.ruleId)).toEqual(['no-console']);
  });

  // Vite reads JSX only in a .jsx or .tsx file, so a test with JSX in another format can't run.
  it.each(jsFormats.filter(format => !format.endsWith('x')))(
    'rejects JSX in a .%s test',
    async format => {
      const code = `${imports(format, 'expect, it')}\nit('renders', () => {\n  expect(<div id={env.X} />).toBeTruthy();\n});\n`;
      const [result] = await eslint.lintText(code, { filePath: `tests/a/x.test.${format}` });
      expect(result.fatalErrorCount).toBe(1);
    }
  );

  it.each(jsFormats.filter(format => format.endsWith('x')))(
    'reads JSX in a .%s test',
    async format => {
      const code = `${imports(format, 'expect, it')}\nit('renders', () => {\n  expect(<div id={env.X} />).toBeTruthy();\n});\n`;
      const [result] = await eslint.lintText(code, { filePath: `tests/a/x.test.${format}` });
      expect(result.messages).toEqual([]);
    }
  );

  it.each(tsFormats)('parses a .%s test as TypeScript', async format => {
    const config = (await eslint.calculateConfigForFile(`tests/a/x.test.${format}`)) as {
      languageOptions: { parser: unknown };
    };
    expect(config.languageOptions.parser).toBe(tsParser);
  });
});
