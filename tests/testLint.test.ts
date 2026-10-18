import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// AFA-70 and AFA-150: lint fails a test that skips itself, or that is marked as expected to fail or
// as a todo (AGENTS.md rule 3). These tests lint text in memory, so no such test is committed. A
// test without type information reads the text, also with CI=true (see lintFormats.test.ts).
const eslint = new ESLint({
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  overrideConfig: { languageOptions: { parserOptions: { project: false } } },
});

/** The problems in a test file with this body. Each is a rule, or the message of a syntax rule. */
async function problems(body: string): Promise<string[]> {
  const names = ['describe', 'expect', 'it', 'test'].filter(name =>
    new RegExp(`\\b${name}\\b`).test(body)
  );
  const code = `import { ${names.join(', ')} } from 'vitest';\n\n${body}\n`;
  const [result] = await eslint.lintText(code, { filePath: 'tests/a/x.test.ts' });
  return result.messages.map(({ ruleId, message }) =>
    ruleId === 'no-restricted-syntax' ? message : String(ruleId)
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
    [`it('x', { todo: 'false' }, ${pass});`, fails],
    // Item 2: a skip from the test's context.
    [`it('x', ({ skip }) => {\n  skip();\n  expect(1).toBe(1);\n});`, skip],
    [`it.concurrent('x', ({ skip }) => {\n  skip();\n  expect(1).toBe(1);\n});`, skip],
    [`it.skipIf(Date.now() < 0)('x', ({ skip }) => {\n  skip();\n  expect(1).toBe(1);\n});`, skip],
    [`it.for([1])('x', (n, { skip }) => {\n  skip();\n  expect(n).toBe(1);\n});`, skip],
    // Item 3: constant conditions that aren't literals.
    [`it.runIf(undefined)('x', ${pass});`, constant],
    [`it.runIf(void 0)('x', ${pass});`, constant],
    [`it.skipIf(!0)('x', ${pass});`, constant],
    [`it.skipIf(\`x\`)('x', ${pass});`, constant],
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
  ])('allows %s', async body => {
    expect(await problems(body)).toEqual([]);
  });
});
