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

## Parser and git coordinates

`coordinates.json` records the installed Stryker 10.0.0 and Vitest runner 10.0.0 with the same
single-worker config and reporter described above. Recreate each recorded source and test,
then run the fixture's Stryker command. The five unimported nullish expressions have one
`LogicalOperator` mutant each, all with `NoCoverage`. The imported string's empty replacement
survives, and both mutations of the function under the reasonless directive are `Ignored`.
There are eight mutants, no kills and a score of 0%, so the unchanged break threshold of 98
makes the fixture exit 1 while still writing its complete report.

These fixtures come from the ticket and maintainer's comment. Coordinate expectations are
hand calculations, with lines and columns numbered from 1:

- In `cr.ts`, `ls.ts` and `ps.ts`, `const a = 1;` has 12 UTF-16 units, followed by one
  terminator that Babel counts but git doesn't. `a ?? 2` starts at Babel line 2, column 11,
  hence git line 1, column 24. It ends at Babel column 17, hence git column 30.
- In `lf.ts` and `crlf.ts`, both tools put the expression on line 2, columns 11 through 17.
  A change only to line 1 must leave that uncovered expression out of the check.
- In `ignored.ts`, the literal U+2028 inside the string makes the directive Babel line 3,
  git line 2. The function is Babel line 4, git line 3. The 33 characters preceding `a ?? 2`
  put its start at column 34; the exclusive end is column 40 in either coordinate system.
  Changing only git line 3 must flag the ignored mutant, even though the directive didn't
  change. The string mutant spans Babel lines 1–2 but stays on git line 1 and must not count.

`mutationCheck.test.ts` uses this report in temporary git repositories, checking both missed
mutants and false positives. `changedLines.test.ts` also checks mixed terminators, spanning
mutants, UTF-16 columns, unchanged LF/CRLF overlap behavior and that filtering leaves the
report's parser coordinates intact. The filter uses the report's source rather than reparsing
or starting Stryker; it works on the single full report and the aggregate shard report alike.
