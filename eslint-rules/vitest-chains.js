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
// A call in a chain's names.
const CALL = '()';

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

/**
 * The root of a chain and its member names, from the root out. CALL marks each call, so the
 * result of test.extend(...) differs from test.extend itself.
 */
function chainOf(node) {
  const names = [];
  let current = node;
  for (;;) {
    if (current.type === 'MemberExpression') {
      names.unshift(propertyName(current));
      current = current.object;
    } else if (current.type === 'CallExpression') {
      names.unshift(CALL);
      current = current.callee;
    } else if (current.type === 'TaggedTemplateExpression') {
      // A table, as in it.each`a ${1}`.
      names.unshift(CALL);
      current = current.tag;
    } else if (
      current.type === 'ChainExpression' ||
      current.type === 'TSNonNullExpression' ||
      current.type === 'TSAsExpression' ||
      current.type === 'TSSatisfiesExpression' ||
      current.type === 'TSTypeAssertion'
    ) {
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

/** The key that a destructuring pattern gives a name, as in const { for: f } = it. */
function destructuredKey(pattern, name) {
  for (const property of pattern.properties) {
    if (property.type !== 'Property') continue;
    const value =
      property.value.type === 'AssignmentPattern' ? property.value.left : property.value;
    if (value.type === 'Identifier' && value.name === name) return keyName(property);
  }
  return undefined;
}

/**
 * Where a chain starts. A Vitest chain gives { fn, names }: the test or suite function and the
 * member names after it. The root is an import from vitest, or from a local module such as a
 * fixtures file that exports test.extend(...). It can also be a namespace import of vitest,
 * require('vitest'), a Vitest global, or a variable that holds such a chain. A root that can't be
 * resolved, such as a parameter, gives { unknown: true, name, names }. A known local value that
 * isn't a test, such as an object, gives undefined.
 */
function resolveChain(node, scope, seen = new Set()) {
  const { root, names } = chainOf(node);
  if (root.type !== 'Identifier' || seen.has(root)) return undefined;
  seen.add(root);
  const unknown = { unknown: true, name: root.name, names };
  const variable = findVariable(scope, root.name);
  // A global, as the .cjs tests get from vitest.config.ts.
  if (!variable || variable.defs.length === 0) {
    return TEST_FUNCTIONS.has(root.name) ? { fn: root.name, names } : undefined;
  }
  const [definition] = variable.defs;
  if (definition.type === 'ImportBinding') {
    const source = definition.parent.source.value;
    const local = source.startsWith('.') || source.startsWith('#');
    if (definition.node.type === 'ImportNamespaceSpecifier') {
      if (source === 'vitest') {
        return TEST_FUNCTIONS.has(names[0]) ? { fn: names[0], names: names.slice(1) } : undefined;
      }
      return local ? unknown : undefined;
    }
    const imported = definition.node.imported?.name ?? definition.node.imported?.value;
    if (definition.node.type === 'ImportSpecifier' && TEST_FUNCTIONS.has(imported)) {
      if (source === 'vitest' || local) return { fn: imported, names };
    }
    // Another export of a local module, such as a fixtures file's myTest, may be a test function.
    return local ? unknown : undefined;
  }
  if (definition.type === 'Variable') {
    const { id, init } = definition.node;
    // A variable with no value here, as in let t; t = it, may hold a test function.
    if (!init) return unknown;
    if (id.type === 'ObjectPattern') {
      const key = destructuredKey(id, root.name);
      if (
        init.type === 'CallExpression' &&
        init.callee.type === 'Identifier' &&
        init.callee.name === 'require' &&
        init.arguments[0]?.value === 'vitest'
      ) {
        return TEST_FUNCTIONS.has(key) ? { fn: key, names } : undefined;
      }
      const base = resolveChain(init, variable.scope, seen);
      if (base?.unknown) return unknown;
      return base && key !== undefined
        ? { fn: base.fn, names: [...base.names, key, ...names] }
        : base && unknown;
    }
    if (id.type !== 'Identifier') return unknown;
    const base = resolveChain(init, variable.scope, seen);
    if (base?.unknown) return unknown;
    return base && { fn: base.fn, names: [...base.names, ...names] };
  }
  // A parameter may hold a test function, as in function run(t) { t.fails(...) }.
  if (definition.type === 'Parameter') return unknown;
  return undefined;
}

const UNARY = {
  '!': value => !value,
  '-': value => -value,
  '+': value => +value,
  '~': value => ~value,
  typeof: value => typeof value,
};

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
      // A BigInt operand can make an operator throw, as +1n does.
      try {
        return UNARY[node.operator] ? UNARY[node.operator](value) : UNKNOWN;
      } catch {
        return UNKNOWN;
      }
    }
    case 'BinaryExpression': {
      const left = staticValue(node.left);
      const right = staticValue(node.right);
      if (left === UNKNOWN || right === UNKNOWN || !BINARY[node.operator]) return UNKNOWN;
      // A BigInt operand can make an operator throw, as 1n + 1 does.
      try {
        return BINARY[node.operator](left, right);
      } catch {
        return UNKNOWN;
      }
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
    // A chain from a test function. A root that can't be resolved counts when it has the name of
    // one, as before AFA-172.
    const testChain = result =>
      result?.unknown
        ? TEST_FUNCTIONS.has(result.name)
          ? { fn: result.name, names: result.names }
          : undefined
        : result;

    /**
     * Reports each use of the context's skip in a test function. vitest/no-disabled-tests already
     * reports ctx.skip() on the first parameter of a bare it or test call, so that call isn't
     * reported twice.
     */
    const checkContext = (fn, index, pluginReportsCall) => {
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
        const called = parent.parent?.type === 'CallExpression' && parent.parent.callee === parent;
        if (
          parent.type === 'MemberExpression' &&
          parent.object === reference.identifier &&
          propertyName(parent) === 'skip' &&
          !(pluginReportsCall && called)
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
      // .fails or .todo on a chain from a test function, also in an alias. On a root that can't
      // be resolved, only a call counts, as in t.fails(...) or t.todo.each(...).
      MemberExpression(node) {
        if (!MARKS.has(propertyName(node))) return;
        const result = resolve(node.object, node);
        const { parent } = node;
        const called =
          (parent.type === 'CallExpression' && parent.callee === node) ||
          (parent.type === 'MemberExpression' &&
            parent.object === node &&
            ['each', 'for'].includes(propertyName(parent)));
        if ((result && !result.unknown) || (result?.unknown && called)) {
          context.report({ node: node.property, messageId: 'mark' });
        }
      },
      // const { todo } = it
      VariableDeclarator(node) {
        if (node.id.type !== 'ObjectPattern' || !node.init) return;
        const result = resolve(node.init, node);
        if (!result || result.unknown) return;
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
              (testChain(resolve(callee.object, node)) && truthiness(condition) !== undefined))
          ) {
            context.report({ node: condition, messageId: 'constant' });
          }
          return;
        }

        const chain = testChain(resolve(callee, node));
        // A call to extend, scoped or override takes fixtures, not test options.
        if (!chain || FIXTURES.has(chain.names.at(-1))) return;

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
        const bare =
          callee.type === 'Identifier' && (callee.name === 'it' || callee.name === 'test');
        if (fn) checkContext(fn, chain.names.includes('for') ? 1 : 0, bare);
      },
    };
  },
};
