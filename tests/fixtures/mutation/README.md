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

## Parallel reports

`shards/` records another installed Stryker 10.0.0 fixture, through the real CI inventory,
prepare, shard-config, pack and merge commands. It uses the same pattern, unchanged `break: 98`
and single-worker fixture setup above. Machine-specific configuration and dependencies are
removed; `filesRead` retains the source inventory and actual boolean/range values. The artifact
run identity is `fixture-head`; the digest binds each bundle to that recorded inventory.

To reproduce, write `inventory.json`'s `files[path].source` and a report's `testFiles[path].source`
to a temporary directory, link the installed dependencies and use the package/Vitest setup above.
Use the project's Stryker config with the absolute JSON reporter plugin, `concurrency: 1`, and
`vitest: { configFile: 'vitest.config.mjs' }`. Set `GITHUB_RUN_ID=fixture`,
`GITHUB_RUN_ATTEMPT=1`, `GITHUB_SHA=head` and `GITHUB_OUTPUT` to a temporary file. Then:

1. Run `node <repo>/.github/scripts/mutation-shards.mjs inventory`.
2. For each of `parse-start`, `parse-end`, `tokenize`, `rest`, run `prepare <shard>`, read `mutate`
   from the output file, and run the installed Stryker CLI with
   `run <repo>/.github/scripts/stryker-shard.config.mjs --incremental --mutate "$mutate"`.
3. Run `pack <shard> <exit-status>` and put its `reports/mutation-shard.json` in
   `reports/shards/<shard>/mutation-shard.json`.
4. Run `merge`. A separate ordinary full Stryker run has identical mutant identities and statuses.

The expectations follow from the test assertions and directives, independently of the merger:

- The first parser range contains two killed `negate` mutants and the killed boolean on line 341.
- The second range begins with the top-level `parseMeasurement` on line 342. Its empty block is
  killed; its four condition changes survive because the test only checks for a defined result.
- Both `tokenize` mutants are killed.
- Both `other.ts` mutants are killed. `new.ts`'s unimported boolean has no coverage. `explained.ts`'s boolean is ignored with a reason.
  `types.ts` has no mutants but is fully selected by the last shard.

There are 14 mutants: 8 killed, 4 survived, 1 with no coverage and 1 ignored. The aggregate score
is 8/13 = 61.5384…%, so merge exits 1 at 98. Each shard exits 0 with its break check disabled.
The ordinary full run also exits 1 at the same score. Stryker IDs restart in each shard; identity
uses file, location, mutator and replacement instead. Test IDs are remapped with their definitions.

Using the merged report as the next shared input reuses 3/3, 5/5, 2/2 and 3/4 results respectively.
The ignored result is an early result rather than a reused one. Removing the changed parser from
that shared input via `mutation-check.mjs --prepare` forces both parser ranges to retest, while
other files still reuse results. Ordinary fixture tests require neither a second Stryker run nor
network access. `tests/mutationJob.test.ts` exercises the real merge and prepare commands against
these reports, including missing, duplicate, stale, stopped and incomplete artifacts;
`tests/mutationShards.test.mjs` checks the whole-file coverage proof directly.
