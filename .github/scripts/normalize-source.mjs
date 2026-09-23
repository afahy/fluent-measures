import ts from 'typescript';

// Node properties that hold positions, cached data or formatting. Every other primitive
// property, such as a unary expression's `operator` or an import's `isTypeOnly`, is syntax
// that ts.forEachChild doesn't visit, so it goes into the shape. An unknown property counts as
// a change, which is the safe direction for the regression check.
const IGNORED_PROPERTIES = new Set([
  'pos',
  'end',
  'id',
  'kind',
  'text',
  'escapedText',
  'flags',
  'modifierFlagsCache',
  'transformFlags',
  'multiLine',
  'numericLiteralFlags',
  'hasExtendedUnicodeEscape',
  'singleQuote',
]);
// The node flags that are syntax: `let`, `const`, `using` and `declare global`. The other flags
// record things like attached JSDoc comments or parse errors.
const SYNTAX_FLAGS = ts.NodeFlags.BlockScoped | ts.NodeFlags.GlobalAugmentation;

/** A JSON.stringify replacer that leaves out positions. */
const withoutPositions = (key, value) => (key === 'pos' || key === 'end' ? undefined : value);

/**
 * Returns the comments in a file that TypeScript reads as directives: pragmas such as
 * `/// <reference types="node" />`, `// @ts-nocheck` and `@jsxImportSource`, and each
 * `@ts-ignore` or `@ts-expect-error` with the line of code it applies to. They can change
 * the emitted code, the emitted typings or the type check, so unlike other comments they count.
 * TypeScript doesn't export the source file properties that hold them, so
 * tests/normalizeSource.test.ts fails if a TypeScript release removes them.
 *
 * @param {ts.SourceFile} file
 * @returns {string}
 */
function directives(file) {
  const pragmas = [...(file.pragmas ?? [])].map(([name, value]) => [
    name,
    [value].flat().map(pragma => pragma.arguments),
  ]);
  const comments = (file.commentDirectives ?? []).map(({ range, type }) => [
    type,
    file.text.slice(range.end).trimStart().split('\n')[0].trim(),
  ]);
  return JSON.stringify({ pragmas, comments }, withoutPositions);
}

function shape(node) {
  let result = `(${node.kind}`;
  if (node.kind === ts.SyntaxKind.SourceFile) {
    result += directives(node);
  } else {
    // Identifier text is a getter, not an own property, so read it directly.
    if (typeof node.text === 'string') result += JSON.stringify(node.text);
    for (const key of Object.keys(node).sort()) {
      const value = node[key];
      if (!IGNORED_PROPERTIES.has(key) && ['string', 'number', 'boolean'].includes(typeof value)) {
        result += ` ${key}=${JSON.stringify(value)}`;
      }
    }
    if (node.flags & SYNTAX_FLAGS) result += ` flags=${node.flags & SYNTAX_FLAGS}`;
  }
  ts.forEachChild(node, child => {
    result += shape(child);
  });
  return `${result})`;
}

/**
 * Returns a string that is the same for two versions of a file when they differ only in
 * comments or formatting. For code, that is the syntax tree without positions, plus the
 * comments that TypeScript reads as directives, such as `/// <reference types="node" />` and
 * `// @ts-ignore`. Other comments, including JSDoc, aren't child nodes, so they don't appear in
 * it. JSON is compared after parsing, and any other file as plain text.
 *
 * @param {string} path The file's path, which decides how it is parsed.
 * @param {string} text The file's contents.
 * @returns {string}
 */
export function normalizeSource(path, text) {
  if (path.endsWith('.json')) return JSON.stringify(JSON.parse(text));
  if (!/\.[cm]?[jt]sx?$/.test(path)) return text;
  return shape(ts.createSourceFile(path, text, ts.ScriptTarget.Latest));
}
