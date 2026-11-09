# Unit names with spelling errors

<!-- cspell:ignore kilgrm kilogrammez -->

## What it does

With `fuzzy: true`, the user gets a measurement from a unit name that has one spelling error.
Without it, a unit name must be exact.

## How a user reaches it

- `fuzzy: true`: `5 foots 10 inc` and `150 ponds`.
- `fuzzy: false` or no `fuzzy`, which turns fuzzy matching off: `5 foots 10 inc` is `null`.
- A word with two spelling errors, which never matches: `70 kilgrm`.
- An exact name with `fuzzy: true`, which still matches.
- A British spelling, which matches only when exact: `95 kilogrammez` is `null`.
- English words that the reviewed table blocks, which never match: `food`, `kill`, `fees`.
- An invalid `fuzzy`, such as `1`, which throws, and the retired `fuzziness`, which throws a
  migration error.
- `import` and `require`.

## Where the rules are

- README.md, "Usage"
- README.md, "API reference"
- PARSING.md, "Fuzzy Matching"

## How to verify it

- Source: `src/matchUnit.ts`, `src/levenshtein.ts`
- Tests: `tests/matchUnit.oneEdit.test.ts`, `tests/matchUnit.englishWords.test.ts`,
  `tests/matchUnit.test.ts`, `tests/parseMeasurement.britishUnits.test.ts`,
  `tests/parseMeasurement.completeEntry.test.ts`, `tests/parseMeasurement.completeEntryWork.test.ts`, `tests/numberReading.test.ts`, `tests/parseMeasurement.signedOtherTypeOwnership.test.ts`, `tests/parseMeasurement.signedWeightOwnership.test.ts`, `tests/parseMeasurement.rangeUnits.test.ts`, `tests/parseMeasurement.fuzzyUnits.test.ts`, `tests/matchUnit.closest.test.ts`, `tests/parseMeasurement.calculator.test.ts`, `tests/parseMeasurement.wordedRanges.test.ts`,
  `tests/parseMeasurement.numberWordCommas.test.ts`, `tests/parseMeasurement.commaBetweenWords.test.ts`,
  `tests/levenshtein.test.ts`
- Properties: "generated single measurements" in `tests/properties.test.ts`
- Properties: "generated fuzzy boundaries" in `tests/properties.test.ts`
- Reviewed English words: `tests/fixtures/unitTypos/englishWords.json`
- Corpus categories: `typos`
