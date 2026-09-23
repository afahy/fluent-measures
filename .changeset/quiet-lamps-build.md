---
'@afahy/fluent-measures': patch
---

Fix the `prepare`, `prepack` and `prepublishOnly` lifecycle scripts. They were top-level `package.json` keys, which npm and pnpm ignore. Packing or publishing now cleans and rebuilds `dist/` first, so a release can no longer ship stale build output.
