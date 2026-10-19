import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import vitest from '@vitest/eslint-plugin';
import vitestChains from './eslint-rules/vitest-chains.js';

// The file formats that vitest.config.ts runs as tests (AFA-68), for every file under tests/.
// TypeScript's parser reads the TypeScript formats. The JavaScript formats get ESLint's own
// parser, and tests/lintFormats.test.ts checks that the two lists cover Vitest's formats.
const TS_TESTS = 'tests/**/*.{ts,mts,cts,tsx}';
const JS_TESTS = 'tests/**/*.{js,mjs,cjs,jsx}';
// Options that the TypeScript and JavaScript blocks share.
const UNUSED = { argsIgnorePattern: '^_', varsIgnorePattern: '^_' };
const CONSOLE = ['warn', { allow: ['warn', 'error'] }];
export default [
  eslint.configs.recommended,
  {
    ignores: ['**/node_modules/**', '**/dist/**'],
    files: ['src/**/*.ts', TS_TESTS],
    // No rule here uses type information, so the parser doesn't build TypeScript's program
    // (AFA-127). Then lint reads the same text as tests/lintFormats.test.ts does.
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', UNUSED],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': CONSOLE,
      // TypeScript allows overloads and declaration merging, such as two interfaces with the same
      // name. typescript-eslint's version of the rule allows them, and still finds a repeated var,
      // which tsc accepts (AFA-127). As on main, it reports a type and a value with the same name.
      'no-redeclare': 'off',
      '@typescript-eslint/no-redeclare': 'error',
    },
  },
  // In a TypeScript test, tsc checks each name, also the Node globals such as process, so
  // typescript-eslint recommends this (AFA-127). src/ keeps no-undef: tsc reads Node's types for
  // it too, but the package also runs in a browser, so it mustn't use Node's globals.
  {
    files: [TS_TESTS],
    rules: { 'no-undef': 'off' },
  },
  {
    files: [JS_TESTS],
    rules: {
      'no-unused-vars': ['error', UNUSED],
      'no-console': CONSOLE,
    },
  },
  // `console` is a global wherever this code runs, so `no-console` decides which calls are allowed:
  // it warns about each call other than warn and error. A JavaScript test imports its other
  // globals, so `no-undef` still finds a name that it forgets, as it does in src/.
  {
    files: ['src/**/*.ts', JS_TESTS],
    languageOptions: { globals: { console: 'readonly' } },
  },
  // Vite reads JSX only in .jsx and .tsx files. TypeScript's parser reads it in a .tsx file, and
  // ESLint's parser needs this option for a .jsx test.
  {
    files: ['tests/**/*.jsx'],
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
  },
  // A .cts test is CommonJS, so it loads a module with require (AFA-127).
  {
    files: ['tests/**/*.cts'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  // A .cjs test can't import Vitest, which is ESM only, so it uses the globals that
  // vitest.config.ts turns on. Node gives a CommonJS module its file and folder names too.
  {
    files: ['tests/**/*.cjs'],
    languageOptions: {
      globals: {
        ...vitest.environments.env.globals,
        __filename: 'readonly',
        __dirname: 'readonly',
      },
    },
  },
  // Every test must be able to fail (AGENTS.md rule 10): it must reach an expect, and no expect
  // may sit in a branch that can be skipped.
  {
    files: [TS_TESTS, JS_TESTS],
    plugins: { vitest, local: { rules: { 'vitest-chains': vitestChains } } },
    rules: {
      ...vitest.configs.recommended.rules,
      // The preset sets these too. They're repeated so rule 10's checks stay errors if the preset
      // changes. Only expect counts as an assertion, not assert (AFA-70).
      'vitest/expect-expect': ['error', { assertFunctionNames: ['expect'] }],
      'vitest/no-conditional-expect': 'error',
      // An early return or other branch can skip a test's only expect.
      'vitest/no-conditional-in-test': 'error',
      // An expect inside a loop or a callback can run fewer times than the test needs, or not at
      // all. So such a test must say how many assertions it expects (AFA-70). The rule misses some
      // loops. It also doesn't check a test with an options object as its second argument, such as
      // it('x', { timeout: 1000 }, fn). vitest.config.ts fails a test that runs no expect, but
      // only a count catches a loop that runs too few times.
      'vitest/prefer-expect-assertions': [
        'error',
        { onlyFunctionsWithExpectInLoop: true, onlyFunctionsWithExpectInCallback: true },
      ],
      // The preset only warns, and lint passes with warnings. AGENTS.md rule 3 forbids skipping a
      // test to make CI pass (AFA-70).
      'vitest/no-disabled-tests': 'error',
      // Other ways to skip a test or to mark it as expected to fail, which rule 3 forbids too
      // (AFA-70, AFA-150). no-disabled-tests finds .skip on an alias or a chain such as
      // test.concurrent.skip, and ctx.skip() in the first parameter. The local rule follows each
      // Vitest chain to its import (AFA-172). It finds .fails, .todo, their options, a skip from
      // the test's context and a constant condition. A skipIf with a real condition stays
      // allowed, such as the one for Stryker in AFA-95.
      'local/vitest-chains': 'error',
      // A count of 0 assertions.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.name='expect'][callee.property.name='assertions'][arguments.0.value=0]",
          message: 'A test must reach an expect (AGENTS.md rule 10).',
        },
      ],
      // Vitest's expect takes an optional message as its second argument.
      'vitest/valid-expect': ['error', { maxArgs: 2 }],
    },
  },
];
