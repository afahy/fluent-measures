// Each build's size budget, minified and brotlied. CI fails when a build goes over it.
// The budget is a deliberate decision. AGENTS.md allows a raise of 0.5 kB in the same PR only
// when the smallest fix goes over the budget. A larger raise is the maintainer's decision, on its
// own `needs-decision` ticket. The "Bundle Size" note in CONTRIBUTING.md states the budget too,
// so update both.
module.exports = [
  {
    path: 'dist/index.js',
    limit: '5 kB',
  },
  {
    path: 'dist/index.cjs',
    limit: '5 kB',
  },
];
