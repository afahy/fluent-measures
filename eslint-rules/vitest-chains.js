import vitest from '@vitest/eslint-plugin';

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
const WRAPPERS = new Set([
  'ChainExpression',
  'TSNonNullExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
]);

const MESSAGES = {
  constant: 'A constant condition always skips the test or always runs it. Use a real one.',
  mark: "Don't mark a test as expected to fail or as a todo (AGENTS.md rule 3).",
  skip: "Don't skip a test (AGENTS.md rule 3).",
};

/** The name of a member's property, also in brackets, as in it['fails']. */
function propertyName(member) {
  return keyName({ key: member.property, computed: member.computed });
}

/** A key's name, also in quotes, as in { 'fails': true }. */
function keyName(property) {
  if (!property.computed && property.key.type === 'Identifier') return property.key.name;
  if (property.key.type === 'Literal' && typeof property.key.value === 'string') {
    return property.key.value;
  }
  if (property.key.type === 'TemplateLiteral' && property.key.expressions.length === 0) {
    return property.key.quasis[0].value.cooked;
  }
  return undefined;
}

function unwrap(node) {
  while (WRAPPERS.has(node.type)) node = node.expression;
  return node;
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
    } else if (WRAPPERS.has(current.type)) {
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

/** Whether a call is require('vitest'). */
function isRequireVitest(node) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'require' &&
    node.arguments[0]?.value === 'vitest'
  );
}

/** Append names to a chain, including a namespace that hasn't selected a test function yet. */
function appendNames(base, names) {
  if (base?.namespace) {
    if (names.length === 0) return base;
    return TEST_FUNCTIONS.has(names[0]) ? { fn: names[0], names: names.slice(1) } : undefined;
  }
  return base && { ...base, names: [...base.names, ...names] };
}

/**
 * Where a chain starts. A Vitest chain gives { fn, names }: the test or suite function and the
 * member names after it. The root is an import from vitest, or from a local module such as a
 * fixtures file that exports test.extend(...). It can also be a namespace import of vitest,
 * require('vitest'), a Vitest global, or a variable that holds such a chain. A root that can't be
 * resolved, such as a parameter, gives { unknown: true, name, names }. A namespace without a
 * selected test gives { namespace: true }. A known non-test gives undefined; an unresolved
 * factory result or object member remains unknown.
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
    // TypeScript's import vitest = require('vitest') has its module in moduleReference, and acts
    // as a namespace import.
    const equals = definition.node.type === 'TSImportEqualsDeclaration';
    const source = equals
      ? definition.node.moduleReference.expression?.value
      : definition.parent.source?.value;
    if (typeof source !== 'string') return undefined;
    const local = source.startsWith('.') || source.startsWith('#');
    if (equals || definition.node.type === 'ImportNamespaceSpecifier') {
      if (source === 'vitest') {
        return appendNames({ namespace: true }, names);
      }
      return unknown;
    }
    const imported = definition.node.imported?.name ?? definition.node.imported?.value;
    if (definition.node.type === 'ImportSpecifier' && TEST_FUNCTIONS.has(imported)) {
      if (source === 'vitest' || local) return { fn: imported, names };
    }
    // Other imports, including path aliases and fixture packages, may export test functions.
    // Vitest's own non-test exports, such as expect, are known.
    return source === 'vitest' ? undefined : unknown;
  }
  if (definition.type === 'Variable') {
    const { id, init } = definition.node;
    // A variable with no value here, as in let t; t = it, may hold a test function.
    if (!init) return unknown;
    if (id.type === 'ObjectPattern') {
      const key = destructuredKey(id, root.name);
      // const { it } = require('vitest'), or const { it } = v for a namespace v.
      const base = isRequireVitest(unwrap(init))
        ? { namespace: true }
        : resolveChain(init, variable.scope, seen);
      if (base?.unknown) return unknown;
      return base && key !== undefined ? appendNames(base, [key, ...names]) : base && unknown;
    }
    if (id.type !== 'Identifier') return unknown;
    // const v = require('vitest') is a namespace.
    if (isRequireVitest(unwrap(init))) {
      return appendNames({ namespace: true }, names);
    }
    const base = resolveChain(init, variable.scope, seen);
    if (base?.unknown) return unknown;
    if (base) return appendNames(base, names);
    // A factory's return value or an object's member may be a test, even when the root isn't.
    const value = unwrap(init);
    if (
      (value.type === 'ObjectExpression' && names.length > 0) ||
      (['ArrowFunctionExpression', 'FunctionExpression'].includes(value.type) && names[0] === CALL)
    ) {
      return unknown;
    }
    return undefined;
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

/** Follow only a local const with an initializer, and stop cycles between aliases. */
function constantBinding(node, scope, seen) {
  if (node.type !== 'Identifier') return undefined;
  const variable = findVariable(scope, node.name);
  const definition = variable?.defs[0];
  if (
    seen.has(variable) ||
    definition?.type !== 'Variable' ||
    definition.parent.kind !== 'const' ||
    definition.node.id.type !== 'Identifier' ||
    !definition.node.init
  ) {
    return undefined;
  }
  return {
    variable,
    node: definition.node.init,
    scope: variable.scope,
    seen: new Set([...seen, variable]),
  };
}

/** The value of an expression of literals, such as !!1 or `${1}`, or UNKNOWN. */
function staticValue(node, scope, seen = new Set()) {
  node = unwrap(node);
  const evaluate = child => staticValue(child, scope, seen);
  switch (node.type) {
    case 'Literal':
      return node.regex ? UNKNOWN : node.value;
    case 'TemplateLiteral': {
      const parts = node.expressions.map(evaluate);
      if (parts.includes(UNKNOWN)) return UNKNOWN;
      return node.quasis
        .map((quasi, i) => quasi.value.cooked + (i < parts.length ? String(parts[i]) : ''))
        .join('');
    }
    case 'Identifier': {
      const binding = constantBinding(node, scope, seen);
      if (binding) return staticValue(binding.node, binding.scope, binding.seen);
      // A local binding named undefined, NaN or Infinity isn't the built-in constant.
      if (findVariable(scope, node.name)?.defs.length) return UNKNOWN;
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
    }
    case 'UnaryExpression': {
      if (node.operator === 'void') return undefined;
      const value = evaluate(node.argument);
      if (value === UNKNOWN) return UNKNOWN;
      // A BigInt operand can make an operator throw, as +1n does.
      try {
        return UNARY[node.operator] ? UNARY[node.operator](value) : UNKNOWN;
      } catch {
        return UNKNOWN;
      }
    }
    case 'BinaryExpression': {
      const left = evaluate(node.left);
      const right = evaluate(node.right);
      if (left === UNKNOWN || right === UNKNOWN || !BINARY[node.operator]) return UNKNOWN;
      // A BigInt operand can make an operator throw, as 1n + 1 does.
      try {
        return BINARY[node.operator](left, right);
      } catch {
        return UNKNOWN;
      }
    }
    case 'LogicalExpression': {
      const left = evaluate(node.left);
      if (left === UNKNOWN) return UNKNOWN;
      if (node.operator === '&&') return left ? evaluate(node.right) : left;
      if (node.operator === '||') return left ? left : evaluate(node.right);
      return left == null ? evaluate(node.right) : left;
    }
    case 'ConditionalExpression': {
      const test = evaluate(node.test);
      if (test === UNKNOWN) return UNKNOWN;
      return evaluate(test ? node.consequent : node.alternate);
    }
    case 'SequenceExpression':
      return evaluate(node.expressions.at(-1));
    default:
      return UNKNOWN;
  }
}

/** Whether an expression is truthy on every run, falsy on every run, or undefined if neither. */
function truthiness(node, scope, seen = new Set()) {
  node = unwrap(node);
  const value = staticValue(node, scope, seen);
  if (value !== UNKNOWN) return Boolean(value);
  const binding = constantBinding(node, scope, seen);
  if (binding) return truthiness(binding.node, binding.scope, binding.seen);
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
        const inner = truthiness(node.argument, scope, seen);
        return inner === undefined ? undefined : !inner;
      }
      return undefined;
    case 'LogicalExpression': {
      const left = truthiness(node.left, scope, seen);
      const right = truthiness(node.right, scope, seen);
      if (node.operator === '&&') {
        if (left === false || right === false) return false;
        return left === true ? right : undefined;
      }
      if (node.operator === '||') {
        if (left === true || right === true) return true;
        return left === false ? right : undefined;
      }
      const first = staticValue(node.left, scope, seen);
      if (first !== UNKNOWN) return first == null ? right : left;
      // Falsy does not mean non-nullish: an unknown left side may select the right side.
      if (left === true) return true;
      return left === false && right === false ? false : undefined;
    }
    default:
      return undefined;
  }
}

/** A member can be assigned directly or as a leaf of a destructuring target. */
function isWrite(node) {
  const { parent } = node;
  if (
    WRAPPERS.has(parent.type) ||
    ['ArrayPattern', 'ObjectPattern', 'RestElement'].includes(parent.type) ||
    (parent.type === 'Property' &&
      parent.value === node &&
      parent.parent.type === 'ObjectPattern') ||
    (parent.type === 'AssignmentPattern' && parent.left === node)
  ) {
    return isWrite(parent);
  }
  return (
    (['AssignmentExpression', 'ForOfStatement', 'ForInStatement'].includes(parent.type) &&
      parent.left === node) ||
    parent.type === 'UpdateExpression' ||
    (parent.type === 'UnaryExpression' && parent.operator === 'delete')
  );
}

/** Only immutable Vitest imports and unchanged direct aliases are proven read-only calls. */
function readOnlyTestCall(node, scope, seen = new Set()) {
  const { root, names } = chainOf(node);
  if (root.type !== 'Identifier') return false;
  const variable = findVariable(scope, root.name);
  if (seen.has(variable)) return false;
  if (variable?.references.some(reference => reference.isWrite() && !reference.init)) {
    return false;
  }
  if (!variable || variable.defs.length === 0) {
    return names.length === 0 && TEST_FUNCTIONS.has(root.name);
  }
  seen.add(variable);
  const [definition] = variable.defs;
  if (definition.type === 'ImportBinding' && definition.parent.source?.value === 'vitest') {
    if (definition.node.type === 'ImportNamespaceSpecifier') {
      return names.length === 1 && TEST_FUNCTIONS.has(names[0]);
    }
    const imported = definition.node.imported?.name ?? definition.node.imported?.value;
    return names.length === 0 && TEST_FUNCTIONS.has(imported);
  }
  return (
    names.length === 0 &&
    definition.type === 'Variable' &&
    definition.node.id.type === 'Identifier' &&
    Boolean(definition.node.init) &&
    readOnlyTestCall(definition.node.init, variable.scope, seen)
  );
}

/** A prototype setter isn't an own property, unlike a computed key, method or accessor. */
function isPrototypeSetter(property) {
  return (
    property.type === 'Property' &&
    !property.computed &&
    !property.method &&
    property.kind === 'init' &&
    keyName(property) === '__proto__'
  );
}

/** Whether a known own property reads a primitive without invoking an effectful getter. */
function safeOwnRead(node, key, scope, seen = new Set()) {
  if (typeof key !== 'string') return false;
  node = unwrap(node);
  const binding = constantBinding(node, scope, seen);
  if (binding) return safeOwnRead(binding.node, key, binding.scope, binding.seen);
  if (node.type !== 'ObjectExpression') return false;
  let safe;
  for (const property of node.properties) {
    if (property.type === 'SpreadElement') {
      const spread = safeOwnRead(property.argument, key, scope, seen);
      if (spread !== undefined) safe = spread;
    } else if (property.type === 'Property' && !isPrototypeSetter(property)) {
      const name = keyName(property) ?? staticValue(property.key, scope, seen);
      if (name === UNKNOWN) safe = false;
      else if (String(name) === key) {
        safe =
          property.kind === 'get'
            ? !getterMayChange(property)
            : staticValue(property.value, scope, seen) !== UNKNOWN;
      }
    }
  }
  return safe;
}

/** An object's const binding can still be written through a member, an alias or an escape. */
function objectMayChange(variable, seen = new Set()) {
  if (!variable) return true;
  if (seen.has(variable)) return false;
  seen.add(variable);
  return variable.references.some(reference => {
    if (reference.isTypeReference && !reference.isValueReference) return false;
    let value = reference.identifier;
    if (value === variable.defs[0]?.node.id) return false;
    // A TypeScript typeof query is a value reference in the scope manager, but never runs.
    while (value.parent.type === 'TSQualifiedName') value = value.parent;
    if (value.parent.type === 'TSTypeQuery') return false;
    // Logical expressions can return the object itself, so follow that value to its use.
    while (WRAPPERS.has(value.parent.type) || value.parent.type === 'LogicalExpression') {
      value = value.parent;
    }
    const { parent } = value;
    if (parent.type === 'MemberExpression' && parent.object === value) {
      let member = parent;
      while (WRAPPERS.has(member.parent.type)) member = member.parent;
      const use = member.parent;
      const key = propertyName(parent) ?? staticValue(parent.property, reference.from);
      return (
        !safeOwnRead(variable.defs[0].node.init, key, variable.scope) ||
        isWrite(member) ||
        (use.type === 'CallExpression' && use.callee === member) ||
        use.type === 'TaggedTemplateExpression'
      );
    }
    if (parent.type === 'VariableDeclarator' && parent.init === value) {
      return (
        parent.id.type !== 'Identifier' ||
        objectMayChange(findVariable(reference.from, parent.id.name), seen)
      );
    }
    // Object spreads copy properties; array/call spreads execute the object's iterator.
    if (parent.type === 'SpreadElement') return parent.parent.type !== 'ObjectExpression';
    if (parent.type === 'CallExpression') {
      // A recognized chain can be reassigned or customized; only proven calls read options.
      return !readOnlyTestCall(parent.callee, reference.from);
    }
    // Numeric/string coercion can invoke valueOf, toString or Symbol.toPrimitive.
    if (parent.type === 'UnaryExpression') {
      return !['!', 'typeof', 'void'].includes(parent.operator);
    }
    if (parent.type === 'BinaryExpression') {
      return !['===', '!=='].includes(parent.operator);
    }
    return true;
  });
}

/** Unknown keys or getter effects can replace any earlier value. */
function uncertainProperties(properties, property, scope) {
  for (const [key, entry] of properties) properties.set(key, { ...entry, uncertain: true });
  // Keep uncertainty through a const alias or a containing spread, even with no known keys.
  properties.set(UNKNOWN, { property, scope, uncertain: true });
}

/** A literal return cannot mutate options; other getter bodies may have side effects. */
function getterMayChange(property) {
  if (property.type !== 'Property' || property.kind !== 'get') return false;
  const statements = property.value.body.body;
  if (statements.length !== 1 || statements[0].type !== 'ReturnStatement') return true;
  const returned = statements[0].argument;
  return returned !== null && unwrap(returned).type !== 'Literal';
}

/** A custom prototype can supply an inherited getter; null and primitives cannot. */
function prototypeMayChange(property, scope, seen) {
  return isPrototypeSetter(property) && staticValue(property.value, scope, seen) === UNKNOWN;
}

/** Resolve an options object, its const aliases and spreads, respecting the last known key. */
function optionProperties(node, scope, seen = new Set()) {
  node = unwrap(node);
  const binding = constantBinding(node, scope, seen);
  if (binding) {
    const properties = optionProperties(binding.node, binding.scope, binding.seen);
    if (objectMayChange(binding.variable)) {
      for (const [key, entry] of properties) properties.set(key, { ...entry, uncertain: true });
    }
    return properties;
  }
  const properties = new Map();
  if (node.type !== 'ObjectExpression') {
    if (staticValue(node, scope, seen) === UNKNOWN) uncertainProperties(properties, node, scope);
    return properties;
  }
  for (const property of node.properties) {
    if (property.type === 'SpreadElement') {
      const spread = optionProperties(property.argument, scope, seen);
      if (spread.has(UNKNOWN)) uncertainProperties(properties, property, scope);
      // Known final keys in the spread override its unknown keys, regardless of Map order.
      for (const [key, entry] of spread) {
        if (key !== UNKNOWN) properties.set(key, entry);
      }
    } else if (property.type === 'Property') {
      const key = keyName(property) ?? staticValue(property.key, scope, seen);
      if (key === UNKNOWN) uncertainProperties(properties, property, scope);
      else properties.set(String(key), { property, scope });
    }
  }
  // Reads may invoke own or inherited getters; spreading invokes own getters too.
  if (
    node.properties.some(
      property => getterMayChange(property) || prototypeMayChange(property, scope, seen)
    )
  ) {
    uncertainProperties(properties, node, scope);
  }
  return properties;
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
    const pluginSkips = new Set();
    const skips = [];
    // Ask the installed plugin which exact nodes it reports. A name alone can't tell us:
    // named imports can be aliased, fixture imports aren't configured, and stored members
    // aren't calls. Keep the plugin's error when it reports a skip, and fill only its gaps.
    const disabled = vitest.rules['no-disabled-tests'].create(
      Object.create(context, {
        report: {
          value: ({ node, messageId }) => {
            if (messageId === 'disabledTest' || messageId === 'disabledSuite') {
              pluginSkips.add(node);
            }
          },
        },
      })
    );
    const reportSkip = (node, key = node) => skips.push({ node, key });
    // A chain from a test function. A root that can't be resolved counts when it has the name of
    // one, as before AFA-172.
    const testChain = result => {
      if (result?.namespace) return undefined;
      if (!result?.unknown) return result;
      return TEST_FUNCTIONS.has(result.name) ? { fn: result.name, names: result.names } : undefined;
    };

    /**
     * Reports each use of a context variable's skip, also through an alias such as
     * const other = ctx, including TypeScript wrappers around the reference.
     */
    const checkContextVariable = (variable, seen = new Set()) => {
      if (!variable || seen.has(variable)) return;
      seen.add(variable);
      for (const reference of variable.references) {
        let value = reference.identifier;
        while (WRAPPERS.has(value.parent.type)) value = value.parent;
        const { parent } = value;
        if (
          parent.type === 'MemberExpression' &&
          parent.object === value &&
          propertyName(parent) === 'skip'
        ) {
          reportSkip(parent, parent.property);
        }
        if (parent.type === 'VariableDeclarator' && parent.init === value) {
          if (parent.id.type === 'ObjectPattern') {
            if (parent.id.properties.some(p => p.type === 'Property' && keyName(p) === 'skip')) {
              reportSkip(parent.id);
            }
          } else if (parent.id.type === 'Identifier') {
            const [alias] = sourceCode.getDeclaredVariables(parent);
            checkContextVariable(alias, seen);
          }
        }
      }
    };

    /** Reports each use of the context's skip in a test function. */
    const checkContext = (fn, index) => {
      let param = fn.params[index];
      if (param?.type === 'AssignmentPattern') param = param.left;
      if (!param) return;
      if (param.type === 'ObjectPattern') {
        for (const property of param.properties) {
          if (property.type === 'Property' && keyName(property) === 'skip') {
            reportSkip(property, property.key);
          }
        }
        return;
      }
      if (param.type !== 'Identifier') return;
      const variable = sourceCode.getDeclaredVariables(fn).find(v => v.name === param.name);
      checkContextVariable(variable);
    };

    return {
      'Program:exit'() {
        for (const { node, key } of skips) {
          if (!pluginSkips.has(key)) context.report({ node, messageId: 'skip' });
        }
      },
      'CallExpression:exit'(node) {
        disabled['CallExpression:exit'](node);
      },
      // .fails or .todo on a chain from a test function, also in an alias. On a root that can't
      // be resolved, only a call counts, as in t.fails(...) or t.todo.each(...).
      MemberExpression(node) {
        const name = propertyName(node);
        // .skip on a chain, including a stored member or an alias.
        if (name === 'skip') {
          const result = resolve(node.object, node);
          if (testChain(result)) {
            reportSkip(node.property);
          }
          return;
        }
        if (!MARKS.has(name)) return;
        const result = resolve(node.object, node);
        const { parent } = node;
        const called =
          (parent.type === 'CallExpression' && parent.callee === node) ||
          (parent.type === 'MemberExpression' &&
            parent.object === node &&
            ['each', 'for'].includes(propertyName(parent)));
        if (result?.fn || (result?.unknown && called)) {
          context.report({ node: node.property, messageId: 'mark' });
        }
      },
      // const { todo } = it
      VariableDeclarator(node) {
        if (node.id.type !== 'ObjectPattern' || !node.init) return;
        const result = resolve(node.init, node);
        if (!result?.fn) return;
        for (const property of node.id.properties) {
          if (property.type !== 'Property') continue;
          const key = keyName(property);
          if (MARKS.has(key)) context.report({ node: property, messageId: 'mark' });
          if (key === 'skip') reportSkip(property, property.key);
        }
      },
      CallExpression(node) {
        disabled.CallExpression(node);
        const { callee } = node;
        const scope = sourceCode.getScope(node);
        const last = callee.type === 'MemberExpression' ? propertyName(callee) : undefined;

        // A constant condition. A literal counts on any object, as before AFA-150.
        if (last === 'skipIf' || last === 'runIf') {
          const [condition] = node.arguments;
          if (
            condition &&
            (condition.type === 'Literal' ||
              (testChain(resolve(callee.object, node)) &&
                truthiness(condition, scope) !== undefined))
          ) {
            context.report({ node: condition, messageId: 'constant' });
          }
          return;
        }

        const chain = testChain(resolve(callee, node));
        // A call to extend, scoped or override takes fixtures, not test options.
        if (!chain || FIXTURES.has(chain.names.at(-1))) return;

        // Test options follow the name. A one-argument call through a reassigned alias may
        // mutate an object, but its first argument isn't a test-options position.
        for (const argument of node.arguments.slice(1)) {
          for (const [key, { property, scope: at, uncertain }] of optionProperties(
            argument,
            scope
          )) {
            if (key === UNKNOWN) continue;
            if (!uncertain && truthiness(property.value, at) === false) continue;
            if (MARKS.has(key)) {
              context.report({ node: property, messageId: 'mark' });
            }
            if (key === 'skip') {
              reportSkip(property, property.key);
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
