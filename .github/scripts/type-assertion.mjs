import ts from 'typescript';

// tsc's error for a `@ts-expect-error` comment above a line that has no type error.
const UNUSED_EXPECT_ERROR = 'TS2578';
// Vitest's type-level assertions. A type error inside one of these calls means it failed.
const ASSERTIONS = new Set(['expectTypeOf', 'assertType']);

/**
 * Returns the name that a call chain such as `expectTypeOf(x).not.toEqualTypeOf<T>()` starts
 * with.
 *
 * @param {ts.Node} node
 * @returns {string | undefined}
 */
function chainStart(node) {
  while (
    ts.isCallExpression(node) ||
    ts.isPropertyAccessExpression(node) ||
    ts.isElementAccessExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    node = node.expression;
  }
  return ts.isIdentifier(node) ? node.text : undefined;
}

/**
 * Returns whether a tsc error in a test file is a type-level assertion failing: an unused
 * `@ts-expect-error`, or an error inside an `expectTypeOf` or `assertType` call. Other type
 * errors, such as a call written for a signature that the base branch doesn't have, don't
 * show that the test checks the fix.
 *
 * @param {string} path The test file's path.
 * @param {string} text The test file's contents.
 * @param {{ line: number, column: number, code: string }} error The error's 1-based line and
 *   column and its code, as tsc prints them.
 * @returns {boolean}
 */
export function isTypeAssertionError(path, text, { line, column, code }) {
  if (code === UNUSED_EXPECT_ERROR) return true;
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const position = file.getPositionOfLineAndCharacter(line - 1, column - 1);
  const inAssertion = node => {
    if (position < node.getStart(file) || position >= node.end) return false;
    if (ts.isCallExpression(node) && ASSERTIONS.has(chainStart(node.expression))) return true;
    return ts.forEachChild(node, inAssertion) ?? false;
  };
  return ts.forEachChild(file, inAssertion) ?? false;
}
