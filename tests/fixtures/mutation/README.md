# Recorded mutation report

`full.json` was recorded with the installed Stryker 10.0.0 and Vitest runner 10.0.0,
using the project's `mutation-json` reporter, mutation pattern and break threshold of 98.
It retains the real results, locations, sources, test definitions and file inventory.
Machine paths, tool configuration and dependency metadata are omitted.

To reproduce, make a temporary fixture directory with access to the installed dependencies.
Write each `files[path].source` and `testFiles[path].source` from the JSON to that path.
Also write these files, which Stryker's ordinary report omits:

```ts
// src/types.ts
export type Unit = string;

// src/unrelated.test.ts
export const testOnly = true;

// src/node_modules/unread.ts
export const unread = true;
```

Use `{"type":"module"}` as `package.json`, and this `vitest.config.mjs`:

```js
export default { test: { include: ['tests/**/*.test.ts'] } };
```

Use the project's Stryker config with `concurrency: 1`, the absolute path of
`.github/scripts/mutation-report.mjs` as its second plugin, and
`vitest: { configFile: 'vitest.config.mjs' }`. Run the installed Stryker CLI from that directory
with `run --incremental`. No full repository mutation run is needed to record this fixture.

The expected behavior follows from the fixture's tests and directives:

- Both mutants of `negate` fail its boolean assertions: two `Killed` results.
- Replacing `pick` with a function returning `undefined` fails `toBeDefined`. Four changes to
  its condition still return a defined number: one `Killed` and four `Survived` results.
- Nothing imports `orphan`, so its boolean mutant has `NoCoverage`.
- The two disable directives each produce an `Ignored` mutant. Only one has a reason.
- `types.ts` is selected for mutation but produces none. It appears only in `filesRead`.
- `unrelated.test.ts` is read but excluded from mutation (`false`). The nested `node_modules`
  file is never read, so it has no entry in either map.

Ignoring the two ignored mutants, three of eight are killed: a score of 37.5%. Stryker exits
with status 1 at the unchanged threshold of 98 and still writes the report. The filter tests
use it without installing Stryker in their git fixture repositories. This ensures a report
check cannot accidentally start a second mutation run.

For the incremental freshness probe, append a comment after `negate` on the same line. A normal
incremental run reuses eight of ten results, including both mutants on that changed line.
Remove `src/covered.ts` from the incremental report with the check's `--prepare` mode, then
run again. Six results are reused; both changed-line mutants are tested again. The two ignored
mutants are early results and are not counted as reused by Stryker.
