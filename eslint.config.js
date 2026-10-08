import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import vitest from '@vitest/eslint-plugin';

// The file formats that vitest.config.ts runs as tests (AFA-68), for every file under tests/.
// TypeScript's project covers the TypeScript formats. The JavaScript formats get ESLint's own
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
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
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
    },
  },
  {
    files: [JS_TESTS],
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: {
      'no-unused-vars': ['error', UNUSED],
      'no-console': CONSOLE,
    },
  },
  // A .cjs test can't import Vitest, which is ESM only, so it uses the globals that
  // vitest.config.ts turns on.
  {
    files: ['tests/**/*.cjs'],
    languageOptions: { globals: vitest.environments.env.globals },
  },
  // Every test must be able to fail (AGENTS.md rule 11): it must reach an expect, and no expect
  // may sit in a branch that can be skipped.
  {
    files: [TS_TESTS, JS_TESTS],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      // The preset sets these too. They're repeated so rule 11's checks stay errors if the preset
      // changes. Only expect counts as an assertion, not assert (AFA-70).
      'vitest/expect-expect': ['error', { assertFunctionNames: ['expect'] }],
      'vitest/no-conditional-expect': 'error',
      // An early return or other branch can skip a test's only expect.
      'vitest/no-conditional-in-test': 'error',
      // An expect inside a loop or a callback can run fewer times than the test needs, or not at
      // all, so such a test must say how many assertions it expects (AFA-70). The rule misses some
      // loops, so vitest.config.ts also fails a test that runs no expect.
      'vitest/prefer-expect-assertions': [
        'error',
        { onlyFunctionsWithExpectInLoop: true, onlyFunctionsWithExpectInCallback: true },
      ],
      // The preset only warns, and lint passes with warnings. AGENTS.md rule 3 forbids skipping a
      // test to make CI pass (AFA-70).
      'vitest/no-disabled-tests': 'error',
      // Other ways to skip a test or to mark it as expected to fail, which rule 3 forbids too, and
      // a count of 0 assertions (AFA-70). A skipIf with a real condition, such as the one for
      // Stryker in AFA-95, stays allowed.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.property.name=/^(skipIf|runIf)$/][arguments.0.type='Literal']",
          message: 'A literal condition always skips the test or always runs it. Use a real one.',
        },
        {
          selector: "MemberExpression[object.name=/^(describe|it|test)$/][property.name='fails']",
          message: "Don't mark a test as expected to fail (AGENTS.md rule 3).",
        },
        {
          selector:
            "CallExpression[callee.object.name='expect'][callee.property.name='assertions'][arguments.0.value=0]",
          message: 'A test must reach an expect (AGENTS.md rule 11).',
        },
      ],
      // Vitest's expect takes an optional message as its second argument.
      'vitest/valid-expect': ['error', { maxArgs: 2 }],
    },
  },
];
