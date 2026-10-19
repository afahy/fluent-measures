// A local ESLint rule for tests (AFA-172). It follows each Vitest chain, such as
// it.skipIf(c).concurrent.each(cases)('x', fn), back to its root, and checks with the scope
// manager that the root is Vitest's it, test, describe or suite. Then it reports what AGENTS.md
// rule 3 forbids: .fails and .todo, their options, a skip from the test's context, and a
// constant skipIf or runIf condition.

const TEST_FUNCTIONS = new Set(['it', 'test', 'describe', 'suite']);
// These take fixtures, not test options.
const FIXTURES = new Set(['extend', 'scoped', 'override']);
const MARKS = new Set(['fails', 'todo']);

const MESSAGES = {
  constant: 'A constant condition always skips the test or always runs it. Use a real one.',
  mark: "Don't mark a test as expected to fail or as a todo (AGENTS.md rule 3).",
  skip: "Don't skip a test (AGENTS.md rule 3).",
};

/** The name of a member's property, also in brackets, as in it['fails']. */
function propertyName(member) {
  if (!member.computed && member.property.type === 'Identifier') return member.property.name;
  if (member.property.type === 'Literal' && typeof member.property.value === 'string') {
    return member.property.value;
  }
  return undefined;
}

/** A key's name, also in quotes, as in { 'fails': true }. */
function keyName(property) {
  if (!property.computed && property.key.type === 'Identifier') return property.key.name;
  if (property.key.type === 'Literal' && typeof property.key.value === 'string') {
    return property.key.value;
  }
  return undefined;
}

/** The root of a chain and its member names, from the root out. */
function chainOf(node) {
  const names = [];
  let current = node;
  for (;;) {
    if (current.type === 'MemberExpression') {
      names.unshift(propertyName(current));
      current = current.object;
    } else if (current.type === 'CallExpression') {
      current = current.callee;
    } else if (current.type === 'ChainExpression' || current.type === 'TSNonNullExpression') {
      current = current.expression;
    } else {
      return { root: current, names };
    }
  }
}

function findVariable(scope, name) {
  for (let current = scope; current; current = current.upper) {
    const variable = current.set.get(name);
    if (variable) return variable;
  }
  return undefined;
}

/**
 * Whether a chain's root is a Vitest test or suite function: an import of it from vitest, a
 * Vitest global, or a variable that holds a chain from one, as in const t = it.fails or
 * const myTest = test.extend({ ... }).
 */
function isVitestRoot(root, scope, seen = new Set()) {
  if (root.type !== 'Identifier' || seen.has(root)) return false;
  seen.add(root);
  const variable = findVariable(scope, root.name);
  // A global, as the .cjs tests get from vitest.config.ts.
  if (!variable || variable.defs.length === 0) return TEST_FUNCTIONS.has(root.name);
  const [definition] = variable.defs;
  if (definition.type === 'ImportBinding') {
    return (
      definition.parent.source.value === 'vitest' &&
      definition.node.type === 'ImportSpecifier' &&
      TEST_FUNCTIONS.has(definition.node.imported.name ?? definition.node.imported.value)
    );
  }
  if (definition.type === 'Variable' && definition.node.init) {
    const { root: initRoot } = chainOf(definition.node.init);
    return isVitestRoot(initRoot, variable.scope, seen);
  }
  return false;
}

/** Whether an expression's truthiness is the same on every run. */
function isConstant(node) {
  switch (node.type) {
    case 'Literal':
    case 'ArrayExpression':
    case 'ObjectExpression':
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
    case 'ClassExpression':
      return true;
    case 'TemplateLiteral':
      return node.expressions.every(isConstant);
    case 'Identifier':
      return ['undefined', 'NaN', 'Infinity'].includes(node.name);
    case 'UnaryExpression':
      return node.operator === 'void' || node.operator === 'typeof' || isConstant(node.argument);
    case 'BinaryExpression':
    case 'LogicalExpression':
      return isConstant(node.left) && isConstant(node.right);
    case 'ConditionalExpression':
      return isConstant(node.test) && isConstant(node.consequent) && isConstant(node.alternate);
    case 'SequenceExpression':
      return isConstant(node.expressions.at(-1));
    default:
      return false;
  }
}

/** Whether a constant option value is false, as in { todo: false } or { fails: 0 }. */
function isFalseValue(node) {
  if (node.type === 'Literal') return !node.value;
  if (node.type === 'Identifier') return node.name === 'undefined';
  if (node.type === 'UnaryExpression' && node.operator === 'void') return true;
  if (node.type === 'UnaryExpression' && node.operator === '!') {
    return isConstant(node.argument) && !isFalseValue(node.argument);
  }
  return false;
}

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Report Vitest tests that skip themselves or are marked as failing' },
    messages: MESSAGES,
    schema: [],
  },
  create(context) {
    const { sourceCode } = context;
    const fromVitest = (node, at = node) => {
      const { root, names } = chainOf(node);
      return isVitestRoot(root, sourceCode.getScope(at)) ? names : undefined;
    };

    /** Reports each use of the context's skip in a test function. */
    const checkContext = (fn, index) => {
      const param = fn.params[index];
      if (!param) return;
      if (param.type === 'ObjectPattern') {
        for (const property of param.properties) {
          if (property.type === 'Property' && keyName(property) === 'skip') {
            context.report({ node: property, messageId: 'skip' });
          }
        }
        return;
      }
      if (param.type !== 'Identifier') return;
      const variable = sourceCode.getDeclaredVariables(fn).find(v => v.name === param.name);
      for (const reference of variable?.references ?? []) {
        const { parent } = reference.identifier;
        if (
          parent.type === 'MemberExpression' &&
          parent.object === reference.identifier &&
          propertyName(parent) === 'skip'
        ) {
          context.report({ node: parent, messageId: 'skip' });
        }
        if (
          parent.type === 'VariableDeclarator' &&
          parent.init === reference.identifier &&
          parent.id.type === 'ObjectPattern' &&
          parent.id.properties.some(p => p.type === 'Property' && keyName(p) === 'skip')
        ) {
          context.report({ node: parent.id, messageId: 'skip' });
        }
      }
    };

    return {
      // .fails or .todo anywhere on a chain from a test function, also in an alias.
      MemberExpression(node) {
        if (MARKS.has(propertyName(node)) && fromVitest(node.object, node)) {
          context.report({ node: node.property, messageId: 'mark' });
        }
      },
      // const { todo } = it
      VariableDeclarator(node) {
        if (node.id.type !== 'ObjectPattern' || !node.init || !fromVitest(node.init, node)) return;
        for (const property of node.id.properties) {
          if (property.type === 'Property' && MARKS.has(keyName(property))) {
            context.report({ node: property, messageId: 'mark' });
          }
        }
      },
      CallExpression(node) {
        const { callee } = node;
        const last = callee.type === 'MemberExpression' ? propertyName(callee) : undefined;

        // A constant condition. A literal counts on any object, as before AFA-150.
        if (last === 'skipIf' || last === 'runIf') {
          const [condition] = node.arguments;
          if (
            condition &&
            (condition.type === 'Literal' ||
              (fromVitest(callee.object, node) && isConstant(condition)))
          ) {
            context.report({ node: condition, messageId: 'constant' });
          }
          return;
        }

        const names = fromVitest(callee, node);
        if (!names || FIXTURES.has(last)) return;

        // The fails and todo options, unless their value is false.
        for (const argument of node.arguments) {
          if (argument.type !== 'ObjectExpression') continue;
          for (const property of argument.properties) {
            if (
              property.type === 'Property' &&
              MARKS.has(keyName(property)) &&
              !isFalseValue(property.value)
            ) {
              context.report({ node: property, messageId: 'mark' });
            }
          }
        }

        // The test's context is the first parameter, or the second after .for. Suites get no
        // context, and in .each no parameter is the context.
        const { root } = chainOf(callee);
        if (root.type !== 'Identifier' || names.includes('each')) return;
        const fn = node.arguments.at(-1);
        if (!fn || (fn.type !== 'ArrowFunctionExpression' && fn.type !== 'FunctionExpression')) {
          return;
        }
        if (root.name === 'describe' || root.name === 'suite') return;
        checkContext(fn, names.includes('for') ? 1 : 0);
      },
    };
  },
};
