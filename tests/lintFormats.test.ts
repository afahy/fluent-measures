import tsParser from '@typescript-eslint/parser';
import { ESLint } from 'eslint';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, matchesGlob, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import vitestConfig from '../vitest.config';
import { git, withoutGitRepository } from './gitEnvironment';

type ConfigObject = { files?: string[]; plugins?: Record<string, unknown> };

// The repository's own files, wherever Vitest runs from.
const root = fileURLToPath(new URL('..', import.meta.url));
const readJson = (file: string): unknown =>
  JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));

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
  const { scripts } = readJson('package.json') as { scripts: Record<string, string> };
  expect(scripts['lint:eslint'].split(' ')).toEqual(['eslint', 'src', 'tests']);
  expect(scripts['lint:eslint:fix'].split(' ')).toEqual(['eslint', 'src', 'tests', '--fix']);
});

// The pre-commit hook must run ESLint on each test format too, so a test with no expect fails
// before CI. lint-staged itself reads the patterns, in a scratch repository with a file of each
// format staged (AFA-127). The ESLint task records the files that it gets, and runs nothing else.
it('runs ESLint on every test format in the pre-commit hook', { timeout: 30_000 }, () => {
  const tasks = readJson('.lintstagedrc') as Record<string, string[]>;
  // lint-staged gives each path under git's top folder, with symbolic links resolved, as on
  // macOS, where /var links to /private/var.
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'fluent-measures-lint-staged-')));
  try {
    const repository = join(scratch, 'repository');
    const log = join(scratch, 'eslint-files');
    const recorder = join(scratch, 'record.cjs');
    writeFileSync(
      recorder,
      `require('node:fs').appendFileSync(${JSON.stringify(log)}, process.argv.slice(2).join('\\n') + '\\n');\n`
    );
    writeFileSync(log, '');
    const config = join(scratch, 'lint-staged.json');
    const eslintGlobs = Object.keys(tasks).filter(glob => tasks[glob].includes('eslint --fix'));
    writeFileSync(
      config,
      JSON.stringify(
        Object.fromEntries(eslintGlobs.map(glob => [glob, `"${process.execPath}" "${recorder}"`]))
      )
    );

    mkdirSync(join(repository, 'tests', 'a'), { recursive: true });
    git(repository, 'init', '--quiet', '--initial-branch', 'main');
    git(repository, 'config', 'user.name', 'Lint Test');
    git(repository, 'config', 'user.email', 'lint-test@example.invalid');
    git(repository, 'config', 'commit.gpgsign', 'false');
    git(repository, 'commit', '--quiet', '--allow-empty', '-m', 'chore: start');
    const files = formats.flatMap(format => [`tests/x.test.${format}`, `tests/a/x.test.${format}`]);
    for (const file of files) writeFileSync(join(repository, file), '');
    git(repository, 'add', '.');

    const lintStaged = dirname(createRequire(import.meta.url).resolve('lint-staged/package.json'));
    execFileSync(
      process.execPath,
      [join(lintStaged, 'bin/lint-staged.js'), '--config', config, '--no-stash', '--quiet'],
      { cwd: repository, env: withoutGitRepository(), stdio: 'pipe' }
    );
    const linted = new Set(
      readFileSync(log, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map(file => relative(repository, file).replace(/\\/g, '/'))
    );
    expect(files.filter(file => !linted.has(file))).toEqual([]);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

// The final review of #91: each format gets the rule-11 checks, and each TypeScript format gets
// TypeScript's parser. A JavaScript test imports its globals, so `no-undef` stays on there. In
// TypeScript, tsc checks each name, so `no-undef` is off (AFA-127).
describe('the lint config for each test format', () => {
  const eslint = new ESLint({ cwd: root });
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

  // `console` is a global, so `no-undef` mustn't reject it. Then `no-console` allows warn and
  // error, and warns about log.
  it.each(jsFormats)('warns only about console.log in a .%s test', async format => {
    const code = `${imports(format, 'expect, it')}\nit('warns', () => {\n  console.warn('w');\n  console.log('l');\n  expect(env.X ?? 'x').toBe('x');\n});\n`;
    const [result] = await eslint.lintText(code, { filePath: `tests/a/x.test.${format}` });
    expect(result.messages.map(({ ruleId, severity }) => [ruleId, severity])).toEqual([
      ['no-console', 1],
    ]);
  });

  // The config doesn't build TypeScript's program, so lint reads TypeScript text as `pnpm lint`
  // reads a file (AFA-127). A Node global such as process needs no import.
  it.each(tsFormats)('lints a .%s test that runs', async format => {
    const code = `import { expect, it } from 'vitest';\nit('reads X', () => {\n  expect(process.env.X ?? 'x').toBe('x');\n});\n`;
    const [result] = await eslint.lintText(code, { filePath: `tests/a/x.test.${format}` });
    expect(result.messages).toEqual([]);
  });

  it.each(tsFormats)('finds a .%s test with no expect', async format => {
    const code = `import { it } from 'vitest';\nit('does nothing', () => {\n  void process;\n});\n`;
    const [result] = await eslint.lintText(code, { filePath: `tests/a/x.test.${format}` });
    expect(result.messages.map(message => message.ruleId)).toEqual(['vitest/expect-expect']);
  });

  it.each(tsFormats)('warns only about console.log in a .%s test', async format => {
    const code = `import { expect, it } from 'vitest';\nit('warns', () => {\n  console.warn('w');\n  console.log('l');\n  expect(1).toBe(1);\n});\n`;
    const [result] = await eslint.lintText(code, { filePath: `tests/a/x.test.${format}` });
    expect(result.messages.map(({ ruleId, severity }) => [ruleId, severity])).toEqual([
      ['no-console', 1],
    ]);
  });

  // The package also runs in a browser, so src/ mustn't use Node's globals, although tsc reads
  // Node's types for it (AFA-127).
  it('rejects a Node global in src/', async () => {
    const code = `export const debug = (): boolean => process.env.DEBUG === '1';\n`;
    const [result] = await eslint.lintText(code, { filePath: 'src/x.ts' });
    expect(result.messages.map(message => message.ruleId)).toEqual(['no-undef']);
  });

  // TypeScript allows overloads, and tsc reports a real redeclaration.
  it('reads overloads in src/', async () => {
    const code = `export function h(a: string): string;\nexport function h(a: number): number;\nexport function h(a: string | number): string | number {\n  return a;\n}\n`;
    const [result] = await eslint.lintText(code, { filePath: 'src/x.ts' });
    expect(result.messages).toEqual([]);
  });

  it('warns only about console.log in src/', async () => {
    const code = `export const report = (): void => {\n  console.warn('w');\n  console.log('l');\n};\n`;
    const [result] = await eslint.lintText(code, { filePath: 'src/x.ts' });
    expect(result.messages.map(({ ruleId, severity }) => [ruleId, severity])).toEqual([
      ['no-console', 1],
    ]);
  });

  // A .cts test is CommonJS, so it loads a module with require.
  it('reads require in a .cts test', async () => {
    const code = `import { expect, it } from 'vitest';\nconst { existsSync } = require('node:fs');\nit('finds the file', () => {\n  expect(existsSync(__filename)).toBe(true);\n});\n`;
    const [result] = await eslint.lintText(code, { filePath: 'tests/a/x.test.cts' });
    expect(result.messages).toEqual([]);
  });

  // Node gives a CommonJS module its file and folder names.
  it('reads __filename and __dirname in a .cjs test', async () => {
    const code = `${imports('cjs', '')}\nit('names the file', () => {\n  expect(__filename.startsWith(__dirname)).toBe(env.X === undefined);\n});\n`;
    const [result] = await eslint.lintText(code, { filePath: 'tests/a/x.test.cjs' });
    expect(result.messages).toEqual([]);
  });

  // Vite reads JSX only in a .jsx or .tsx file, so lint must reject JSX in the other formats.
  it.each(formats.filter(format => !format.endsWith('x')))(
    'rejects JSX in a .%s test',
    async format => {
      const code = `${imports(format, 'expect, it')}\nit('renders', () => {\n  expect(<div id={env.X} />).toBeTruthy();\n});\n`;
      const [result] = await eslint.lintText(code, { filePath: `tests/a/x.test.${format}` });
      expect(result.fatalErrorCount).toBe(1);
    }
  );

  // Lint reads JSX in a .jsx or .tsx test (AFA-127). To run, such a test also needs React, which
  // this project doesn't install, because Vite compiles JSX to React.createElement. tsc also needs
  // the jsx option in tsconfig.json for a .tsx test.
  it.each(formats.filter(format => format.endsWith('x')))(
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
