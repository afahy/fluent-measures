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

function shape(node) {
  let result = `(${node.kind}`;
  if (node.kind !== ts.SyntaxKind.SourceFile) {
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
 * comments or formatting. For code, that is the syntax tree without positions. Comments,
 * including JSDoc, aren't child nodes, so they don't appear in it. JSON is compared after
 * parsing, and any other file as plain text.
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
