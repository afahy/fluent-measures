import { describe, expect, it } from 'vitest';
import { isTypeAssertionError } from '../.github/scripts/type-assertion.mjs';

// The regression check counts a type error against the base branch only when a type assertion
// fails. A /*!*/ comment in each case marks where tsc reports the error.
const MARK = '/*!*/';
const check = (source: string): boolean => {
  const lines = source.split('\n');
  const line = lines.findIndex(text => text.includes(MARK));
  const column = lines[line].indexOf(MARK) + MARK.length + 1;
  return isTypeAssertionError('tests/example.test.ts', source, {
    line: line + 1,
    column,
    code: 'TS2345',
  });
};

describe('isTypeAssertionError', () => {
  it.each([
    ['a type argument to toEqualTypeOf', 'expectTypeOf<string>().toEqualTypeOf</*!*/number>();'],
    ['an argument to toBeCallableWith', "expectTypeOf(f).toBeCallableWith('a', /*!*/3);"],
    ['a chain across lines', 'expectTypeOf(f)\n  .parameter(0)\n  .toEqualTypeOf</*!*/number>();'],
    ['an argument to assertType', "assertType<number>(/*!*/'x');"],
    ['a call inside assertType', "assertType(f('a', /*!*/3));"],
  ])('counts an error in %s', (_, source) => {
    expect(check(source)).toBe(true);
  });

  it('counts an unused @ts-expect-error', () => {
    const source = '// @ts-expect-error\nconst x = 1;';
    const error = { line: 1, column: 1, code: 'TS2578' };
    expect(isTypeAssertionError('tests/example.test.ts', source, error)).toBe(true);
  });

  it.each([
    ['a call inside expect', "expect(f('a', /*!*/3)).toBe(1);"],
    ['a plain call', "f('a', /*!*/3);"],
    ['a declaration', "const /*!*/x: number = 'a';"],
    ['a call that passes expectTypeOf', 'f(expectTypeOf, /*!*/3);'],
  ])("doesn't count an error in %s", (_, source) => {
    expect(check(source)).toBe(false);
  });
});
