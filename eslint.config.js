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
// Vitest's test and suite functions, and a call to one of them. The call can be on a chain such
// as test.concurrent, or after a call such as it.each(cases) or it.concurrent.each(cases).
const TEST_NAMES = '/^(it|test|describe|suite)$/';
const TEST_CALL = `CallExpression:matches(${[
  `[callee.name=${TEST_NAMES}]`,
  `[callee.object.name=${TEST_NAMES}]`,
  `[callee.callee.object.name=${TEST_NAMES}]`,
  `[callee.callee.object.object.name=${TEST_NAMES}]`,
].join(', ')})`;

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
    rules: {
      'no-unused-vars': ['error', UNUSED],
      'no-console': CONSOLE,
    },
  },
  // `console` is a global wherever this code runs, so `no-console` decides which calls are allowed:
  // it warns about each call other than warn and error.
  {
    files: ['src/**/*.ts', TS_TESTS, JS_TESTS],
    languageOptions: { globals: { console: 'readonly' } },
  },
  // Vite reads JSX only in .jsx and .tsx files, so only a .jsx test may hold it.
  {
    files: ['tests/**/*.jsx'],
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
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
    plugins: { vitest },
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
      // Other ways to skip a test or to mark it as expected to fail, which rule 3 forbids too, and
      // a count of 0 assertions (AFA-70, AFA-150). A skipIf with a real condition stays allowed,
      // such as the one for Stryker in AFA-95. no-disabled-tests finds .skip on an alias or a
      // chain such as test.concurrent.skip, and ctx.skip(). It doesn't find .fails, .todo, their
      // options or a skip that the test destructures from its context.
      'no-restricted-syntax': [
        'error',
        {
          // A literal, a template with no expressions, undefined, or an operator on a literal,
          // such as !0 or void 0.
          selector: `CallExpression[callee.property.name=/^(skipIf|runIf)$/]:matches(${[
            "[arguments.0.type='Literal']",
            "[arguments.0.type='TemplateLiteral'][arguments.0.expressions.length=0]",
            "[arguments.0.type='Identifier'][arguments.0.name='undefined']",
            "[arguments.0.type='UnaryExpression'][arguments.0.argument.type='Literal']",
          ].join(', ')})`,
          message: 'A constant condition always skips the test or always runs it. Use a real one.',
        },
        {
          // A call to a .fails or .todo, or to its .each or .for, matches by name. So does each
          // use of .fails or .todo on a test function, as in const t = it.fails or
          // it.fails.concurrent. A field of another object, such as result.todo, doesn't match.
          // Neither do rarer forms, such as it['fails'] or const { todo } = it. The fails and todo
          // options of a test call match, but not { todo: false }.
          selector: [
            'CallExpression > MemberExpression.callee[property.name=/^(fails|todo)$/]',
            'MemberExpression[property.name=/^(each|for)$/] > MemberExpression.object[property.name=/^(fails|todo)$/]',
            `MemberExpression[property.name=/^(fails|todo)$/]:matches([object.name=${TEST_NAMES}], [object.object.name=${TEST_NAMES}])`,
            `${TEST_CALL} > ObjectExpression.arguments > Property:matches([key.name=/^(fails|todo)$/], [key.value=/^(fails|todo)$/]):not([value.raw='false'])`,
          ].join(', '),
          message: "Don't mark a test as expected to fail or as a todo (AGENTS.md rule 3).",
        },
        {
          // The test's context is the first parameter of a call to it or test, also on a chain
          // such as it.concurrent. In .each and .for, the first parameter is a case, which can
          // have its own skip field.
          selector:
            "CallExpression:matches([callee.name=/^(it|test)$/], [callee.object.name=/^(it|test)$/][callee.property.name!=/^(each|for)$/]) > :function.arguments > ObjectPattern.params:first-child > Property[key.name='skip']",
          message: "Don't skip a test (AGENTS.md rule 3).",
        },
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
