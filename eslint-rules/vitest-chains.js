// A local ESLint rule for tests (AFA-172). It follows each Vitest chain back to its root, as in
// it.skipIf(c).concurrent.each(cases)('x', fn). The scope manager checks that the root is
// Vitest's it, test, describe or suite. Then the rule reports what AGENTS.md rule 3 forbids:
// .fails and .todo, their options, a skip from the test's context, and a constant condition.

const TEST_FUNCTIONS = new Set(['it', 'test', 'describe', 'suite']);
const SUITES = new Set(['describe', 'suite']);
// These take fixtures, not test options.
const FIXTURES = new Set(['extend', 'scoped', 'override']);
const MARKS = new Set(['fails', 'todo']);
// The value that staticValue gives when it can't know a value.
const UNKNOWN = Symbol('unknown');

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
 * The Vitest function at the root of a chain, and the member names after it, or undefined. The
 * root is an import from vitest, or from a local module such as a fixtures file that exports
 * test.extend(...). It can also be a namespace import of vitest, a Vitest global, or a variable
 * that holds such a chain, as in const t = it.fails or const myTest = test.extend({ ... }).
 */
function resolveChain(node, scope, seen = new Set()) {
  const { root, names } = chainOf(node);
  if (root.type !== 'Identifier' || seen.has(root)) return undefined;
  seen.add(root);
  const variable = findVariable(scope, root.name);
  // A global, as the .cjs tests get from vitest.config.ts.
  if (!variable || variable.defs.length === 0) {
    return TEST_FUNCTIONS.has(root.name) ? { fn: root.name, names } : undefined;
  }
  const [definition] = variable.defs;
  if (definition.type === 'ImportBinding') {
    const source = definition.parent.source.value;
    if (definition.node.type === 'ImportNamespaceSpecifier') {
      return source === 'vitest' && TEST_FUNCTIONS.has(names[0])
        ? { fn: names[0], names: names.slice(1) }
        : undefined;
    }
    const imported = definition.node.imported?.name ?? definition.node.imported?.value;
    return (source === 'vitest' || source.startsWith('.')) &&
      definition.node.type === 'ImportSpecifier' &&
      TEST_FUNCTIONS.has(imported)
      ? { fn: imported, names }
      : undefined;
  }
  if (definition.type === 'Variable' && definition.node.init) {
    const alias = resolveChain(definition.node.init, variable.scope, seen);
    return alias && { fn: alias.fn, names: [...alias.names, ...names] };
  }
  return undefined;
}

const BINARY = {
  '+': (a, b) => a + b,
  '-': (a, b) => a - b,
  '*': (a, b) => a * b,
  '/': (a, b) => a / b,
  '%': (a, b) => a % b,
  '**': (a, b) => a ** b,
  '==': (a, b) => a == b,
  '!=': (a, b) => a != b,
  '===': (a, b) => a === b,
  '!==': (a, b) => a !== b,
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
  '&': (a, b) => a & b,
  '|': (a, b) => a | b,
  '^': (a, b) => a ^ b,
  '<<': (a, b) => a << b,
  '>>': (a, b) => a >> b,
  '>>>': (a, b) => a >>> b,
};

/** The value of an expression of literals, such as !!1 or `${1}`, or UNKNOWN. */
function staticValue(node) {
  switch (node.type) {
    case 'Literal':
      return node.regex ? UNKNOWN : node.value;
    case 'TemplateLiteral': {
      const parts = node.expressions.map(staticValue);
      if (parts.includes(UNKNOWN)) return UNKNOWN;
      return node.quasis
        .map((quasi, i) => quasi.value.cooked + (i < parts.length ? String(parts[i]) : ''))
        .join('');
    }
    case 'Identifier':
      switch (node.name) {
        case 'undefined':
          return undefined;
        case 'NaN':
          return NaN;
        case 'Infinity':
          return Infinity;
        default:
          return UNKNOWN;
      }
    case 'UnaryExpression': {
      if (node.operator === 'void') return undefined;
      const value = staticValue(node.argument);
      if (value === UNKNOWN) return UNKNOWN;
      switch (node.operator) {
        case '!':
          return !value;
        case '-':
          return -value;
        case '+':
          return +value;
        case '~':
          return ~value;
        case 'typeof':
          return typeof value;
        default:
          return UNKNOWN;
      }
    }
    case 'BinaryExpression': {
      const left = staticValue(node.left);
      const right = staticValue(node.right);
      if (left === UNKNOWN || right === UNKNOWN || !BINARY[node.operator]) return UNKNOWN;
      return BINARY[node.operator](left, right);
    }
    case 'LogicalExpression': {
      const left = staticValue(node.left);
      const right = staticValue(node.right);
      if (left === UNKNOWN || right === UNKNOWN) return UNKNOWN;
      if (node.operator === '&&') return left && right;
      if (node.operator === '||') return left || right;
      return left ?? right;
    }
    case 'ConditionalExpression': {
      const test = staticValue(node.test);
      if (test === UNKNOWN) return UNKNOWN;
      return staticValue(test ? node.consequent : node.alternate);
    }
    case 'SequenceExpression':
      return staticValue(node.expressions.at(-1));
    default:
      return UNKNOWN;
  }
}

/** Whether an expression is truthy on every run, falsy on every run, or undefined if neither. */
function truthiness(node) {
  const value = staticValue(node);
  if (value !== UNKNOWN) return Boolean(value);
  switch (node.type) {
    // An object, an array, a function or a class is always truthy, whatever it holds.
    case 'ArrayExpression':
    case 'ObjectExpression':
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
    case 'ClassExpression':
    case 'NewExpression':
      return true;
    case 'UnaryExpression':
      if (node.operator === 'typeof') return true;
      if (node.operator === '!') {
        const inner = truthiness(node.argument);
        return inner === undefined ? undefined : !inner;
      }
      return undefined;
    default:
      return undefined;
  }
}

/** The first function among a call's arguments, as in test(name, fn, timeout). */
function testFunction(call) {
  return call.arguments.find(
    argument =>
      argument.type === 'ArrowFunctionExpression' || argument.type === 'FunctionExpression'
  );
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
    const resolve = (node, at) => resolveChain(node, sourceCode.getScope(at));

    /** Reports each use of the context's skip in a test function. */
    const checkContext = (fn, index) => {
      let param = fn.params[index];
      if (param?.type === 'AssignmentPattern') param = param.left;
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
        // vitest/no-disabled-tests already reports ctx.skip() on the first parameter.
        if (
          parent.type === 'MemberExpression' &&
          parent.object === reference.identifier &&
          propertyName(parent) === 'skip' &&
          !(
            index === 0 &&
            parent.parent.type === 'CallExpression' &&
            parent.parent.callee === parent
          )
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
        if (MARKS.has(propertyName(node)) && resolve(node.object, node)) {
          context.report({ node: node.property, messageId: 'mark' });
        }
      },
      // const { todo } = it
      VariableDeclarator(node) {
        if (node.id.type !== 'ObjectPattern' || !node.init || !resolve(node.init, node)) return;
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
              (resolve(callee.object, node) && truthiness(condition) !== undefined))
          ) {
            context.report({ node: condition, messageId: 'constant' });
          }
          return;
        }

        const chain = resolve(callee, node);
        if (!chain || FIXTURES.has(last)) return;

        // The fails and todo options, unless their value is always false.
        for (const argument of node.arguments) {
          if (argument.type !== 'ObjectExpression') continue;
          for (const property of argument.properties) {
            if (
              property.type === 'Property' &&
              MARKS.has(keyName(property)) &&
              truthiness(property.value) !== false
            ) {
              context.report({ node: property, messageId: 'mark' });
            }
          }
        }

        // The test's context is the first parameter, or the second after .for. Suites get no
        // context, and in .each no parameter is the context.
        if (SUITES.has(chain.fn) || chain.names.includes('each')) return;
        const fn = testFunction(node);
        if (fn) checkContext(fn, chain.names.includes('for') ? 1 : 0);
      },
    };
  },
};
