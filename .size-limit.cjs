// Each build's size budget, minified and brotlied. CI fails when a build goes over it.
// The budget is a deliberate decision, so raising it needs its own ticket. The "Bundle Size"
// note in CONTRIBUTING.md states the budget too, so update both.
module.exports = [
  {
    path: 'dist/index.js',
    limit: '4 kB',
  },
  {
    path: 'dist/index.cjs',
    limit: '4 kB',
  },
];
