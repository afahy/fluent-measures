# Feature map

Each file in this folder describes one feature of `parseMeasurement` from the user's side. Each
file has these four sections, in this order:

1. **What it does**: the result that a user gets, in the user's words.
2. **How a user reaches it**: each way to get that result: the input forms, the options, and
   `import` or `require`.
3. **Where the rules are**: the sections of `README.md` and `PARSING.md` that are the
   specification for the feature.
4. **How to verify it**: the source files, the test files and the corpus categories.

Use the map before you change a result:

- Find each feature that the change touches. A test that checks only one way to reach a feature
  doesn't verify the feature. Test each way that the file lists, or say in the PR why a way
  can't change.
- `pnpm test:package` runs the tests of results against the build, through `import` and through
  `require`. Run it after `pnpm build`.
- Add each new test file and each new way to reach a feature to its file in the same PR.
- `tests/featureMap.test.ts` fails when a `tests/parseMeasurement*.test.ts` file isn't in the map.
  It also fails for a corpus category or a `PARSING.md` section that isn't in the map, and for a
  file that the map names but that doesn't exist.

These tests check every feature, so no feature file lists them: `tests/corpus.test.ts`,
`tests/readme.test.ts`, `tests/docsExamples.test.ts`, `tests/resultSnapshot.test.ts` and
`tests/invariants.test.ts`.

## Features

- [Units and unit names](units.md)
- [Feet and inches](feet-and-inches.md)
- [Numbers](numbers.md)
- [Labels and text around a measurement](labels-and-text.md)
- [More than one measurement](multiple-measurements.md)
- [Conversion to one unit](conversion.md)
- [Numbers with no unit](unqualified.md)
- [Unit names with spelling errors](fuzzy-matching.md)
