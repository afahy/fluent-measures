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

// AFA-180: stored members, aliases and constant expressions must enforce the same policy as
// direct Vitest calls. These expectations follow rule 3, not the rule's previous output.
describe('the additional Vitest chain forms', () => {
  // Custom prototypes can supply getters, and iterable spreads run iterator methods.
  it.each([
    'const options = { __proto__: { get activate(): boolean { this.fails = true; return true; } }, fails: false };\nvoid options.activate;',
    'const parent = { get activate(): boolean { this.fails = true; return true; } };\nconst options = { __proto__: parent, fails: false };\nvoid options.activate;',
    'const options = { __proto__: { __proto__: { get activate(): boolean { this.fails = true; return true; } } }, fails: false };\nvoid options.activate;',
    "const options = { '__proto__': { get activate(): boolean { this.fails = true; return true; } }, fails: false };\nvoid options.activate;",
    'const options = { *[Symbol.iterator](): Generator<number> { this.fails = true; yield 1; }, fails: false };\nvoid [...options];',
    'const options = { *[Symbol.iterator](): Generator<number> { this.fails = true; yield 1; }, fails: false };\nvoid Math.max(...options);',
    'const options = { *[Symbol.iterator](): Generator<number> { this.fails = true; yield 1; }, fails: false };\nconst alias = options;\nvoid [...alias];',
  ])('rejects an active flag after prototype access or iteration in %s', async setup => {
    expect(await problems(setup + "\nit('x', { fails: true, ...options }, " + pass + ');')).toEqual(
      [fails]
    );
  });

  it.each([
    'const options = { metadata: { get activate(): boolean { this.fails = true; return true; } }, fails: false };',
    'const options = { __proto__: null, fails: false };',
    // A primitive prototype setter value is ignored by JavaScript.
    'const options = { __proto__: 1, fails: false };',
    // Computed keys, methods and accessors named __proto__ are ordinary own properties.
    'const options = { ["__proto__"]: { get activate(): boolean { this.fails = true; return true; } }, fails: false };',
    'const options = { __proto__(): void { this.fails = true; }, fails: false };',
    'const options = { get __proto__(): number { return 1; }, fails: false };',
    'const options = { *[Symbol.iterator](): Generator<number> { this.fails = true; yield 1; }, fails: false };\nvoid { ...options };',
  ])('preserves an inactive flag without prototype or iteration effects in %s', async setup => {
    expect(await problems(setup + "\nit('x', { fails: true, ...options }, " + pass + ');')).toEqual(
      []
    );
  });

  it.each([
    'const options = { __proto__: { get activate(): boolean { this.fails = true; return true; } }, fails: false };\nvoid options.activate;',
    'const options = { *[Symbol.iterator](): Generator<number> { this.fails = true; yield 1; }, fails: false };\nvoid [...options];',
  ])('preserves a final false override after prototype access or iteration in %s', async setup => {
    expect(
      await problems(setup + "\nit('x', { ...options, fails: false }, " + pass + ');')
    ).toEqual([]);
  });

  // Converting an options object can invoke user code that reactivates a test flag.
  it.each(['+options', '-options', '~options', 'options + 1', 'options < 2', 'options == 1'])(
    'keeps coercive numeric reads uncertain in %s',
    async expression => {
      expect(
        await problems(
          'const options = { fails: false, valueOf(): number { this.fails = true; return 1; } };\n' +
            `void (${expression});\n` +
            "it('x', { fails: true, ...options }, " +
            pass +
            ');'
        )
      ).toEqual([fails]);
    }
  );

  it.each(["'x' + options", 'options in { active: true }'])(
    'keeps coercive string reads uncertain in %s',
    async expression => {
      expect(
        await problems(
          "const options = { fails: false, toString(): string { this.fails = true; return 'active'; } };\n" +
            `void (${expression});\n` +
            "it('x', { fails: true, ...options }, " +
            pass +
            ');'
        )
      ).toEqual([fails]);
    }
  );

  it('keeps a coercive Symbol.toPrimitive call uncertain', async () => {
    expect(
      await problems(
        'const options = { fails: false, [Symbol.toPrimitive](): number { this.fails = true; return 1; } };\n' +
          "void +options;\nit('x', { fails: true, ...options }, " +
          pass +
          ');'
      )
    ).toEqual([fails]);
  });

  it.each(['void options', '!options', 'typeof options', 'options === other', 'options !== other'])(
    'allows a non-coercive read of options in %s',
    async expression => {
      expect(
        await problems(
          'const options = { fails: false, valueOf(): number { this.fails = true; return 1; } };\n' +
            'const other = JSON.parse("{}");\nvoid other;\n' +
            `void (${expression});\n` +
            "it('x', { fails: true, ...options }, " +
            pass +
            ');'
        )
      ).toEqual([]);
    }
  );

  it('allows an explicit inactive flag after a coercive read', async () => {
    expect(
      await problems(
        'const options = { fails: false, valueOf(): number { this.fails = true; return 1; } };\n' +
          "void +options;\nit('x', { ...options, fails: false }, " +
          pass +
          ');'
      )
    ).toEqual([]);
  });

  // A later spread, computed key or getter can reactivate a known false option.
  it.each([
    'const options = { fails: false };\n' +
      'const runtime = JSON.parse(\'{"fails":true}\') as { fails: boolean };\n' +
      "it('x', { fails: true, ...options, ...runtime }, " +
      pass +
      ');',
    "const options = { fails: false };\nconst key = 'fails';\n" +
      "it('x', { fails: true, ...options, [key]: true }, " +
      pass +
      ');',
    'const options = { fails: false };\nconst key = JSON.parse(\'"fails"\') as string;\n' +
      "it('x', { fails: true, ...options, [key]: true }, " +
      pass +
      ');',
    'const runtime = JSON.parse(\'{"fails":true}\') as { fails: boolean };\n' +
      'const options = { fails: false, ...runtime };\n' +
      "it('x', { fails: true, ...options }, " +
      pass +
      ');',
    'const options = { fails: false, get activate(): boolean { this.fails = true; return true; } };\n' +
      'void options.activate;\n' +
      "it('x', { fails: true, ...options }, " +
      pass +
      ');',
    'const options = { fails: false, get activate(): boolean { this.fails = true; return true; } };\n' +
      'const alias = options;\nvoid alias.activate;\n' +
      "it('x', { fails: true, ...options }, " +
      pass +
      ');',
    'const options = { get activate(): boolean { this.fails = true; return true; }, fails: false };\n' +
      "it('x', { fails: true, ...options }, " +
      pass +
      ');',
  ])('does not trust an overridden or getter-backed option in %s', async body => {
    expect(await problems(body)).toEqual([fails]);
  });

  it.each([
    "it('x', { fails: false, get timeout(): number { return 1000; } }, " + pass + ');',
    'const options = { fails: false, get timeout(): number { return 1000; } };\n' +
      "it('x', options, " +
      pass +
      ');',
    'const runtime = JSON.parse(\'{"fails":true}\') as { fails: boolean };\n' +
      'const options = { fails: true, ...runtime, fails: false };\n' +
      "it('x', { fails: true, ...options }, " +
      pass +
      ');',
    'const runtime = JSON.parse(\'{"fails":true}\') as { fails: boolean };\n' +
      "it('x', { fails: true, ...runtime, fails: false }, " +
      pass +
      ');',
    'const options = { get activate(): boolean { this.fails = true; return true; }, fails: false };\n' +
      "it('x', { ...options, fails: false }, " +
      pass +
      ');',
    "const options = { fails: false };\nconst key = 'timeout';\n" +
      "it('x', { fails: true, ...options, [key]: 1000 }, " +
      pass +
      ');',
    'const options = { fails: false };\n' +
      "it('x', { fails: true, ...options, ...{} }, " +
      pass +
      ');',
    'const options = { fails: false };\n' +
      "it('x', { fails: true, ...options, ...null }, " +
      pass +
      ');',
  ])('preserves a final inactive value after uncertain options in %s', async body => {
    expect(await problems(body)).toEqual([]);
  });

  // AFA-180 re-review: these all write the same object used by the false spread override.
  it.each([
    'const alias = options || {}; alias.fails = true;',
    'const alias = process.env.CI && options; alias.fails = true;',
    'const alias = options ?? {}; alias.fails = true;',
    '({ fails: options.fails } = { fails: true });',
    '[options.fails] = [true];',
    '[options.fails = true] = [];',
    '[...options.fails] = [true];',
    'for (options.fails of [true]) { void options.fails; }',
    'for (options.fails in { active: true }) { void options.fails; }',
  ])('detects an aliased or destructured option write in %s', async write => {
    expect(
      await problems(
        'const options = { fails: false };\n' +
          write +
          "\nit('x', { fails: true, ...options }, " +
          pass +
          ');'
      )
    ).toEqual([fails]);
  });

  it('keeps a discarded logical value as a read of the options', async () => {
    expect(
      await problems(
        'const options = { fails: false };\nvoid (options || {});\n' +
          "it('x', { fails: true, ...options }, " +
          pass +
          ');'
      )
    ).toEqual([]);
  });

  // AFA-180 review: a falsy value can be nullish, and a const object can still change.
  it.each([
    "it('x', { fails: (process.env.CI && false) ?? true }, " + pass + ');',
    "it('x', { todo: (process.env.CI && 0) ?? true }, " + pass + ');',
    "it('x', { fails: (process.env.CI || {}) ?? false }, " + pass + ');',
    'const options = { fails: false };\noptions.fails = true;\n' +
      "it('x', { fails: true, ...options }, " +
      pass +
      ');',
    'const options = { todo: false };\noptions.todo ||= true;\n' +
      "it('x', { todo: true, ...options }, " +
      pass +
      ');',
    'const options = { fails: false };\nconst alias = options;\nalias.fails = true;\n' +
      "it('x', { fails: true, ...options }, " +
      pass +
      ');',
    'const options = { fails: false };\nObject.assign(options, { fails: true });\n' +
      "it('x', { fails: true, ...options }, " +
      pass +
      ');',
    'const options = { fails: false };\ndelete options.fails;\n' +
      "it('x', { fails: true, ...options }, " +
      pass +
      ');',
    'const options = { fails: false };\noptions.fails = true;\n' +
      "it('x', options, " +
      pass +
      ');',
    'const options = { fails: false, activate(): void { this.fails = true; } };\n' +
      "options.activate();\nit('x', { fails: true, ...options }, " +
      pass +
      ');',
  ])('keeps active or uncertain flags rejected in %s', async body => {
    expect(await problems(body)).toEqual([fails]);
  });

  it.each([
    "it.skipIf((process.env.CI && false) ?? true)('x', " + pass + ');',
    "it.runIf((process.env.CI && false) ?? true)('x', " + pass + ');',
    "it('x', { fails: (process.env.CI && false) ?? false }, " + pass + ');',
    'const options = { fails: false };\nconst alias = options;\nvoid options.fails;\n' +
      "it('x', { fails: true, ...alias }, " +
      pass +
      ');',
    'const options = { fails: false };\n' +
      "it('x', { fails: true, ...(options as typeof options) }, " +
      pass +
      ');',
    'const options = { fails: false };\noptions.fails = true;\n' +
      "it('x', { ...options, fails: false }, " +
      pass +
      ');',
  ])('preserves dynamic conditions and final inactive overrides in %s', async body => {
    expect(await problems(body)).toEqual([]);
  });

  it('does not mark a known non-nullish false option as active', async () => {
    // The core lint rule can reject redundant coalescing; this flag is still inactive.
    expect(await problems("it('x', { fails: false ?? true }, " + pass + ');')).not.toContain(fails);
  });

  it.each([
    // 1–3: stored skip, namespace aliases and context aliases through TypeScript wrappers.
    [`const skipped = it.skip;\nskipped('x', ${pass});`, skip],
    [
      `import * as v from 'vitest';\n\nconst w = v;\nw.it.skip('x', () => {\n  v.expect(1).toBe(1);\n});`,
      skip,
    ],
    [`const v = require('vitest');\nconst w = v;\nw.it.fails('x', ${pass});`, fails],
    [
      `import * as v from 'vitest';\n\nconst w = v;\nconst { it, expect } = w;\nit.fails('x', ${pass});`,
      fails,
    ],
    [
      `it('x', ctx => {\n  const other = ctx as typeof ctx;\n  other.skip();\n  expect(1).toBe(1);\n});`,
      skip,
    ],
    [
      `it('x', ctx => {\n  const other = ctx satisfies typeof ctx;\n  other.skip();\n  expect(1).toBe(1);\n});`,
      skip,
    ],
    [`it('x', ctx => {\n  const other = ctx!;\n  other.skip();\n  expect(1).toBe(1);\n});`, skip],
    [
      `it('x', ctx => {\n  const { skip } = (ctx as typeof ctx)!;\n  skip();\n  expect(1).toBe(1);\n});`,
      skip,
    ],
    [`it('x', ctx => {\n  (ctx satisfies typeof ctx).skip();\n  expect(1).toBe(1);\n});`, skip],
    // 4: the right operand decides truthiness even when the left operand is unknown.
    [`it.skipIf(process.env.CI || true)('x', ${pass});`, constant],
    [`it.runIf(process.env.CI && false)('x', ${pass});`, constant],
    [`it.skipIf(process.env.CI || [])('x', ${pass});`, constant],
    [`it.runIf(process.env.CI && 0)('x', ${pass});`, constant],
    [`it.skipIf(true || process.env.CI)('x', ${pass});`, constant],
    [`it.runIf(false && process.env.CI)('x', ${pass});`, constant],
    // 5–6: static template keys and options stored in local const objects.
    [`it[\`fails\`]('x', ${pass});`, fails],
    [`it('x', { [\`todo\`]: true }, ${pass});`, fails],
    [`const options = { fails: true };\nit('x', options, ${pass});`, fails],
    [`const options = { todo: true };\nconst alias = options;\nit('x', alias, ${pass});`, fails],
    [`const options = { skip: true };\nit('x', options as typeof options, ${pass});`, skip],
    // 7: unresolved imports, factory returns and object members can still be test functions.
    [`import { test, expect } from '@/fixtures';\n\ntest.fails('x', ${pass});`, fails],
    [`const make = () => it;\nconst t = make();\nt.fails('x', ${pass});`, fails],
    [`const h = { t: it };\nh.t.fails('x', ${pass});`, fails],
    [`import { test, expect } from 'test-utils';\n\ntest('x', { todo: true }, ${pass});`, fails],
    // 8: fixture imports aren't necessarily read by the plugin.
    [`import { test, expect } from './fixtures';\n\ntest.skip('x', ${pass});`, skip],
    [`import { test, expect } from './fixtures';\n\ntest('x', { skip: true }, ${pass});`, skip],
    // 9–11: truthy skip options, third-argument options, default context and destructured skip.
    [`it('x', { skip: 1 }, ${pass});`, skip],
    [`it('x', { skip: !0 }, ${pass});`, skip],
    [`it('x', ${pass}, { skip: true });`, skip],
    [`it('x', (ctx = {} as never) => {\n  ctx.skip();\n  expect(1).toBe(1);\n});`, skip],
    [`const { skip } = it;\nskip('x', ${pass});`, skip],
    // 12: constants and options spread from const objects, including nested aliases.
    [`const c = true;\nit.skipIf(c)('x', ${pass});`, constant],
    [`const c = false;\nconst alias = c;\nit.runIf(alias)('x', ${pass});`, constant],
    [`const c = 1;\nit.skipIf(c === 1)('x', ${pass});`, constant],
    [`const c = 1;\nit.skipIf(\`\${c}\`)('x', ${pass});`, constant],
    [`const c = {};\nit.skipIf(c)('x', ${pass});`, constant],
    [`const c = process.env.CI || true;\nit.skipIf(c)('x', ${pass});`, constant],
    [`const c = null;\nit.skipIf(c ?? [])('x', ${pass});`, constant],
    [`const o = { todo: true };\nit('x', { ...o }, ${pass});`, fails],
    [`const o = { skip: true };\nconst options = { ...o };\nit('x', options, ${pass});`, skip],
    [`const o = { fails: true };\nit('x', { fails: false, ...o }, ${pass});`, fails],
    // Read a const initializer in its own scope, even when its use shadows a name.
    [
      `const c = true;\nconst options = { fails: c };\nfunction run(c: boolean): void {\n  it('x', options, ${pass});\n  void c;\n}\nrun(false);`,
      fails,
    ],
  ])('rejects the additional form %s', async (body, problem) => {
    expect(await problems(body)).toContain(problem);
  });

  it.each([
    `const underStryker = Boolean(process.env.STRYKER);\nit.skipIf(underStryker)('x', ${pass});`,
    `it.skipIf(process.env.CI || false)('x', ${pass});`,
    `it.runIf(process.env.CI && true)('x', ${pass});`,
    `it.skipIf(process.env.CI ?? true)('x', ${pass});`,
    `const c = Boolean(process.env.CI);\nconst alias = c;\nit.skipIf(alias)('x', ${pass});`,
    // Don't infer const values from mutable or shadowed bindings.
    `let c = true;\nc = c && Boolean(process.env.CI);\nit.skipIf(c)('x', ${pass});`,
    `const c = true;\nfunction run(c: boolean): void {\n  it.skipIf(c)('x', ${pass});\n}\nrun(c);`,
    `const options = { todo: false };\nit('x', options, ${pass});`,
    `const off = false;\nit('x', { fails: off }, ${pass});`,
    `const off = false;\nconst options = { fails: off };\nfunction run(off: boolean): void {\n  it('x', options, ${pass});\n  void off;\n}\nrun(true);`,
    `const o = { skip: false };\nit('x', { ...o }, ${pass});`,
    `const o = { fails: true };\nit('x', { ...o, fails: false }, ${pass});`,
    `const o = { fails: false };\nit('x', { fails: true, ...o }, ${pass});`,
    `const o = { todo: true };\nexport const custom = test.extend(o);`,
    `let options = { todo: true };\noptions = { todo: !options.todo };\nit('x', options, ${pass});`,
    `import * as v from 'vitest';\n\nconst w = v;\nw.expect(1).toBe(1);`,
    `it('x', ctx => {\n  const other = ctx as typeof ctx;\n  expect(other.task.name).toBe('x');\n});`,
    // Custom matcher names aren't test modifiers on Vitest's known expect export.
    `it('x', () => {\n  expect(1).fails();\n});`,
    `it('x', () => {\n  expect(1).todo();\n});`,
  ])('allows the dynamic or inactive form %s', async body => {
    expect(await problems(body)).toEqual([]);
  });

  // Invalid cyclic initializers can have other lint errors; this rule must terminate without
  // inventing a constant condition or a marked test from an unresolved cycle.
  it.each([
    [`const a = b;\nconst b = a;\nit.skipIf(a)('x', ${pass});`, constant],
    [`const a = { ...b };\nconst b = { ...a };\nit('x', a, ${pass});`, fails],
  ])('stops resolving cyclic const bindings in %s', async (body, problem) => {
    expect(await problems(body)).not.toContain(problem);
  });

  // 8: use the installed plugin's report, including import aliases, without adding a second one.
  it.each([
    `it.skip('x', ${pass});`,
    `it('x', { skip: true }, ${pass});`,
    `import { expect, it as t } from 'vitest';\n\nt.skip('x', ${pass});`,
    `import { expect, it as t } from 'vitest';\n\nt('x', { skip: true }, ${pass});`,
    `it.concurrent.skip('x', ${pass});`,
    `it('x', ctx => {\n  ctx.skip();\n  expect(1).toBe(1);\n});`,
  ])('keeps exactly one plugin error for %s', async body => {
    expect(await problems(body)).toEqual(['vitest/no-disabled-tests']);
  });
});
