import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import vitest from '@vitest/eslint-plugin';

export default [
  eslint.configs.recommended,
  {
    ignores: ['**/node_modules/**', '**/dist/**'],
    files: ['src/**/*.ts', 'tests/**/*.ts'],
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
  // Every test must be able to fail (AGENTS.md rule 11): it must reach an expect, and no expect
  // may sit in a branch that can be skipped.
  {
    files: ['tests/**/*.ts'],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      'vitest/expect-expect': 'error',
      'vitest/no-conditional-expect': 'error',
      // Vitest's expect takes an optional message as its second argument.
      'vitest/valid-expect': ['error', { maxArgs: 2 }],
    },
  },
];
