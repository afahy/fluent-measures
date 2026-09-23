import { describe, expect, it } from 'vitest';
import { normalizeSource } from '../.github/scripts/normalize-source.mjs';

// normalizeSource decides whether a fix PR changed the package or only its comments and
// formatting. If it misses a change, the regression check lets the PR through without a test.
const same = (before: string, after: string, path = 'src/example.ts') =>
  normalizeSource(path, before) === normalizeSource(path, after);

describe('normalizeSource', () => {
  it.each([
    ['a unary operator', 'const y = value * -factor;', 'const y = value * +factor;'],
    ['a logical not and a bitwise not', 'const y = !x;', 'const y = ~x;'],
    ['a postfix operator', 'i++;', 'i--;'],
    ['a type operator', 'type K = keyof symbol;', 'type K = unique symbol;'],
    ['let and const', 'let x = 1;', 'const x = 1;'],
    ['var and let', 'var x = 1;', 'let x = 1;'],
    ['const and using', 'const x = r;', 'using x = r;'],
    ['extends and implements', 'class A extends B {}', 'class A implements B {}'],
    ['a type-only export', 'export type { Foo } from "./foo";', 'export { Foo } from "./foo";'],
    ['a type-only import', 'import type { Foo } from "./foo";', 'import { Foo } from "./foo";'],
    ['a type-only specifier', 'import { type Foo } from "./foo";', 'import { Foo } from "./foo";'],
    ['export = and export default', 'export = x;', 'export default x;'],
    ['typeof import', "type T = typeof import('x');", "type T = import('x');"],
    ['a number', 'const x = 1;', 'const x = 2;'],
    ['an identifier', 'const x = a;', 'const x = b;'],
    ['a string', "const x = 'a';", "const x = 'b';"],
  ])('treats a change to %s as a change', (_, before, after) => {
    expect(same(before, after)).toBe(false);
  });

  it.each([
    ['a comment', 'const x = 1;', '// One.\nconst x = 1;'],
    ['a JSDoc comment', 'export function f() {}', '/** Does f. */\nexport function f() {}'],
    ['quote style', "const x = 'a';", 'const x = "a";'],
    ['trailing commas', 'const o = { a: 1, b: [1, 2] };', 'const o = { a: 1, b: [1, 2,], };'],
    ['line breaks', 'const o = { a: 1, b: 2 };', 'const o = {\n  a: 1,\n  b: 2,\n};'],
    ['semicolons', 'const x = 1\nconst y = 2', 'const x = 1;\nconst y = 2;'],
    ['arrow parentheses', 'const f = x => x;', 'const f = (x) => x;'],
    ['numeric separators', 'const x = 1000;', 'const x = 1_000;'],
  ])('treats a change to %s as formatting', (_, before, after) => {
    expect(same(before, after)).toBe(true);
  });

  it('compares JSON after parsing it', () => {
    expect(same('{"a":1}', '{\n  "a": 1\n}\n', 'package.json')).toBe(true);
    expect(same('{"a":1}', '{"a":2}', 'package.json')).toBe(false);
  });
});
