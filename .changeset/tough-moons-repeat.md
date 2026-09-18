---
'@afahy/fluent-measures': patch
---

Fix package entry points so the published package can actually be loaded. `exports.import`, `main` and `module` pointed at `dist/index.mjs`, a file tsup never emits, and `exports.require` pointed at `dist/index.js`, which is ESM. Entry points now match the build output (`dist/index.js` for ESM, `dist/index.cjs` for CJS) with per-condition type declarations.
