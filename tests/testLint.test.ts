import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// AFA-70 and AFA-150: lint fails a test that skips itself, or that is marked as expected to fail or
// as a todo (AGENTS.md rule 3). These tests lint text in memory, so no such test is committed.
const eslint = new ESLint({ cwd: fileURLToPath(new URL('..', import.meta.url)) });

/** The problems in a test file with this body. Each is a rule, or the message of a syntax rule. */
async function problems(body: string): Promise<string[]> {
  const names = ['describe', 'expect', 'it', 'test'].filter(name =>
    new RegExp(`\\b${name}\\b`).test(body)
  );
  // A body that starts with its own import, or that requires vitest, gets no other.
  const code = /^import |require\('vitest'\)/.test(body)
    ? `${body}\n`
    : `import { ${names.join(', ')} } from 'vitest';\n\n${body}\n`;
  const [result] = await eslint.lintText(code, { filePath: 'tests/a/x.test.ts' });
  return result.messages.map(({ ruleId, message }) =>
    ruleId === 'no-restricted-syntax' || ruleId === 'local/vitest-chains' ? message : String(ruleId)
  );
}

const pass = '() => {\n  expect(1).toBe(1);\n}';
const constant = 'A constant condition always skips the test or always runs it. Use a real one.';
const fails = "Don't mark a test as expected to fail or as a todo (AGENTS.md rule 3).";
const skip = "Don't skip a test (AGENTS.md rule 3).";

describe('the lint for tests that skip or are expected to fail', () => {
  it.each([
    // The AFA-70 forms.
    [`it.skip('x', ${pass});`, 'vitest/no-disabled-tests'],
    [`it.fails('x', ${pass});`, fails],
    [`it.skipIf(true)('x', ${pass});`, constant],
    [
      `it('x', () => {\n  expect.assertions(0);\n  expect(1).toBe(1);\n});`,
      'A test must reach an expect (AGENTS.md rule 10).',
    ],
    // AFA-150 item 1: other forms of .fails and .todo.
    [`it.fails.concurrent('x', ${pass});`, fails],
    [`test.fails.sequential('x', ${pass});`, fails],
    [`it.fails.skipIf(Date.now() < 0)('x', ${pass});`, fails],
    [`const t = it.fails;\nt('x', ${pass});`, fails],
    [`it('x', { fails: true }, ${pass});`, fails],
    [`test('x', { todo: true }, ${pass});`, fails],
    [`it.each([1])('x %i', { fails: true }, n => {\n  expect(n).toBe(1);\n});`, fails],
    [`it.concurrent.each([1])('x %i', { fails: true }, n => {\n  expect(n).toBe(1);\n});`, fails],
    [`it('x', { 'fails': true }, ${pass});`, fails],
    [`it.skipIf(Date.now() < 0).concurrent('x', { todo: true }, ${pass});`, fails],
    [`it('x', { todo: 'false' }, ${pass});`, fails],
    // Item 2: a skip from the test's context.
    [`it('x', ({ skip }) => {\n  skip();\n  expect(1).toBe(1);\n});`, skip],
    [`it.concurrent('x', ({ skip }) => {\n  skip();\n  expect(1).toBe(1);\n});`, skip],
    [`it.skipIf(Date.now() < 0)('x', ({ skip }) => {\n  skip();\n  expect(1).toBe(1);\n});`, skip],
    [`it.for([1])('x', (n, { skip }) => {\n  skip();\n  expect(n).toBe(1);\n});`, skip],
    [
      `it.skipIf(Date.now() < 0).concurrent('x', ({ skip }) => {\n  skip();\n  expect(1).toBe(1);\n});`,
      skip,
    ],
    [
      `it.skipIf(Date.now() < 0).for([1])('x', (n, { skip }) => {\n  skip();\n  expect(n).toBe(1);\n});`,
      skip,
    ],
    // Item 3: constant conditions that aren't literals.
    [`it.runIf(undefined)('x', ${pass});`, constant],
    [`it.runIf(void 0)('x', ${pass});`, constant],
    [`it.skipIf(!0)('x', ${pass});`, constant],
    [`it.skipIf(\`x\`)('x', ${pass});`, constant],
    // AFA-172: the local rule follows each chain to its Vitest import, at any depth.
    [
      `it.skipIf(Date.now() < 0).concurrent.each([1])('x', { todo: true }, n => {\n  expect(n).toBe(1);\n});`,
      fails,
    ],
    [
      `it.skipIf(Date.now() < 0).concurrent.for([1])('x', (n, { skip }) => {\n  skip();\n  expect(n).toBe(1);\n});`,
      skip,
    ],
    [`it.sequential.concurrent('x', ({ skip }) => {\n  skip();\n  expect(1).toBe(1);\n});`, skip],
    [`it.for([1])('x', (n, ctx) => {\n  ctx.skip();\n  expect(n).toBe(1);\n});`, skip],
    [`it('x', async ctx => {\n  const { skip } = ctx;\n  skip();\n  expect(1).toBe(1);\n});`, skip],
    [`const myTest = test.extend({ a: 1 });\nmyTest('x', { fails: true }, ${pass});`, fails],
    [`it['fails']('x', ${pass});`, fails],
    [`const { todo } = it;\ntodo('x');`, fails],
    [`it.skipIf(() => Date.now() < 0)('x', ${pass});`, constant],
    [`it.skipIf({})('x', ${pass});`, constant],
    [`it.skipIf(!!1)('x', ${pass});`, constant],
    [`it.runIf(NaN)('x', ${pass});`, constant],
    [`it.skipIf(\`\${1}\`)('x', ${pass});`, constant],
    [`it.skipIf(1 === 1)('x', ${pass});`, constant],
    [`it('x', ({ skip }) => {\n  skip();\n  expect(1).toBe(1);\n}, 1000);`, skip],
    [`it('x', ({ skip } = {}) => {\n  skip();\n  expect(1).toBe(1);\n});`, skip],
    [
      `const f = it.for;\nf([1])('x', (n, { skip }) => {\n  skip();\n  expect(n).toBe(1);\n});`,
      skip,
    ],
    [
      `import { expect, it as describe } from 'vitest';\n\ndescribe('x', ({ skip }) => {\n  skip();\n  expect(1).toBe(1);\n});`,
      skip,
    ],
    [`import * as v from 'vitest';\n\nv.it.fails('x', () => {\n  v.expect(1).toBe(1);\n});`, fails],
    [
      `import { expect, test } from './fixtures';\n\ntest.fails('x', () => {\n  expect(1).toBe(1);\n});`,
      fails,
    ],
    [`it('x', { fails: !NaN }, ${pass});`, fails],
    [`it('x', { fails: !(1 - 1) }, ${pass});`, fails],
    // ctx.skip() on a chain or an alias, which vitest/no-disabled-tests doesn't see.
    [`it.concurrent('x', ctx => {\n  ctx.skip();\n  expect(1).toBe(1);\n});`, skip],
    [`it.skipIf(Date.now() < 0)('x', ctx => {\n  ctx.skip();\n  expect(1).toBe(1);\n});`, skip],
    [
      `import { expect, it as t } from 'vitest';\n\nt('x', ctx => {\n  ctx.skip();\n  expect(1).toBe(1);\n});`,
      skip,
    ],
    [
      `const myTest = test.extend({ a: 1 });\nmyTest('x', ctx => {\n  ctx.skip();\n  expect(1).toBe(1);\n});`,
      skip,
    ],
    // TypeScript's as and satisfies don't hide the chain.
    [`(it as typeof it).fails('x', ${pass});`, fails],
    [`(it satisfies typeof it).todo('x');`, fails],
    // A root that can't be resolved counts for a call to .fails or .todo, as before AFA-172.
    [
      `import { expect } from 'vitest';\nimport { myTest } from './fixtures';\n\nmyTest.fails('x', () => {\n  expect(1).toBe(1);\n});`,
      fails,
    ],
    [
      `import test from './fixtures';\nimport { expect } from 'vitest';\n\ntest.fails('x', () => {\n  expect(1).toBe(1);\n});`,
      fails,
    ],
    [`function run(t: typeof it): void {\n  t.fails('x', ${pass});\n}\nrun(it);`, fails],
    [`let t: typeof it;\nt = it;\nt.fails('x', ${pass});`, fails],
    [`const { it, expect } = require('vitest');\nit.fails('x', ${pass});`, fails],
    // A table, a destructured alias, and an option that throws when it's evaluated.
    [
      `it.each\`\n  a\n  \${1}\n\`('x', { todo: true }, ({ a }) => {\n  expect(a).toBe(1);\n});`,
      fails,
    ],
    [
      `const { for: f } = it;\nf([1])('x', (n, { skip }) => {\n  skip();\n  expect(n).toBe(1);\n});`,
      skip,
    ],
    [`it('x', { fails: +1n }, ${pass});`, fails],
    // Codex on #168: a name destructured from a namespace, an alias of the context, and .skip or
    // the skip option on an alias, which vitest/no-disabled-tests doesn't read.
    [
      `import * as v from 'vitest';\n\nconst { it, expect } = v;\nit.fails('x', () => {\n  expect(1).toBe(1);\n});`,
      fails,
    ],
    [`const v = require('vitest');\nv.it.fails('x', ${pass});`, fails],
    [
      `it.concurrent('x', ctx => {\n  const other = ctx;\n  other.skip();\n  expect(1).toBe(1);\n});`,
      skip,
    ],
    [`const t = it;\nt.skip('x', ${pass});`, skip],
    [`const t = it;\nt('x', { skip: true }, ${pass});`, skip],
    // TypeScript's import-equals form is a namespace import.
    [
      `import vitest = require('vitest');\n\nvitest.it.fails('x', () => {\n  vitest.expect(1).toBe(1);\n});`,
      fails,
    ],
  ])('rejects %s', async (body, problem) => {
    expect(await problems(body)).toContain(problem);
  });

  it.each([
    `it.skipIf(Date.now() < 0)('x', ${pass});`,
    `const ci = Date.now() < 0;\nit.skipIf(!ci)('x', ${pass});`,
    `it('x', () => {\n  const result = { todo: false };\n  expect(result.todo).toBe(false);\n});`,
    `it('x', () => {\n  expect({ todo: true }).toEqual({ todo: true });\n});`,
    `it('x', { todo: false }, ${pass});`,
    `it('x', { timeout: 1000 }, ${pass});`,
    `it('x', ({ task }) => {\n  expect(task.name).toBe('x');\n});`,
    // In .each and .for, the first parameter is a case, and its skip field doesn't skip the test.
    `it.each([{ skip: false }])('x', ({ skip }) => {\n  expect(skip).toBe(false);\n});`,
    `it.for([{ skip: false }])('x', ({ skip }) => {\n  expect(skip).toBe(false);\n});`,
    // test.extend takes fixtures, which can have any name, and a skipIf on another object isn't
    // Vitest's.
    'export const custom = test.extend({ todo: true });',
    `const service = { runIf: (value: unknown): unknown => value };\nit('x', () => {\n  expect(service.runIf(undefined)).toBeUndefined();\n});`,
    `describe.each([{ skip: false }])('x', ({ skip }) => {\n  it('y', () => {\n    expect(skip).toBe(false);\n  });\n});`,
    // AFA-172: a local name that shadows Vitest's isn't a test function.
    `it.each([{ todo: true }])('x', it => {\n  expect(it.todo).toBe(true);\n});`,
    `import { expect, it } from 'vitest';\n\nit('x', () => {\n  const test = { todo: true };\n  expect(test.todo).toBe(true);\n});`,
    // Fixtures and options whose value is false.
    'export const custom = test.override({ todo: 2 });',
    'export const custom = test.extend({ a: 1 }).extend({ todo: 2 });',
    `it('x', { fails: 0 }, ${pass});`,
    `it('x', { todo: undefined }, ${pass});`,
    `it('x', { fails: !1 }, ${pass});`,
    `it.for([1])('x', (n, ctx) => {\n  expect(ctx.task.name).toBe('x');\n  expect(n).toBe(1);\n});`,
    // A real condition, also with typeof or an array, isn't constant.
    `it.skipIf(typeof window !== 'undefined')('x', ${pass});`,
    `it.skipIf(+[process.env.N])('x', ${pass});`,
    // An alias of .each passes a case, not the context.
    // The Vitest plugin doesn't see the alias as a test, so this body has no expect.
    `const e = it.each;\ne([{ skip: 1 }])('x', ({ skip }) => {\n  void skip;\n});`,
    `it('x', { todo: \`\` }, ${pass});`,
    // A destructured .each passes a case, and a destructured extend takes fixtures.
    `const { each: e } = it;\ne([{ skip: 1 }])('x', ({ skip }) => {\n  void skip;\n});`,
    `const { extend } = test;\nexport const my = extend({ todo: 2 });`,
  ])('allows %s', async body => {
    expect(await problems(body)).toEqual([]);
  });

  // vitest/no-disabled-tests reads .skip and the skip option on it or test by name, so the local
  // rule doesn't report them a second time.
  it.each([`it.skip('x', ${pass});`, `it('x', { skip: true }, ${pass});`])(
    'reports %s once',
    async body => {
      expect(await problems(body)).toEqual(['vitest/no-disabled-tests']);
    }
  );

  // vitest/no-disabled-tests reports ctx.skip() on the first parameter, so the local rule doesn't
  // report it a second time.
  it('reports ctx.skip() once', async () => {
    expect(await problems(`it('x', ctx => {\n  ctx.skip();\n  expect(1).toBe(1);\n});`)).toEqual([
      'vitest/no-disabled-tests',
    ]);
  });
});
