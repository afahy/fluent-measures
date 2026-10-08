import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import vitest from '@vitest/eslint-plugin';

// Every format that vitest.config.ts runs as a test (AFA-68). TypeScript's project covers the
// TypeScript formats. The JavaScript formats get ESLint's own parser.
const TS_TESTS = 'tests/**/*.{ts,mts,cts,tsx}';
const JS_TESTS = 'tests/**/*.{js,mjs,cjs,jsx}';

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
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: [JS_TESTS],
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
  },
  // Every test must be able to fail (AGENTS.md rule 11): it must reach an expect, and no expect
  // may sit in a branch that can be skipped.
  {
    files: [TS_TESTS, JS_TESTS],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      // The preset sets these too. They're repeated so rule 11's checks stay errors if the preset
      // changes.
      'vitest/expect-expect': 'error',
      'vitest/no-conditional-expect': 'error',
      // An early return or other branch can skip a test's only expect.
      'vitest/no-conditional-in-test': 'error',
      // Vitest's expect takes an optional message as its second argument.
      'vitest/valid-expect': ['error', { maxArgs: 2 }],
    },
  },
];
