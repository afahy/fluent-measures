# Unit names with spelling errors

## What it does

With `fuzziness`, the user gets a measurement from a unit name that has spelling errors. Without
it, a unit name must be exact.

## How a user reaches it

- `fuzziness: 1` or `fuzziness: 2`: `5 foots 10 inc`.
- An exact name with `fuzziness`, which still matches.
- Words that are near a unit name and never match: `food`, `kill`.
- `import` and `require`.

## Where the rules are

- README.md, "Usage"
- PARSING.md, "Fuzzy Matching"

## How to verify it

- Source: `src/matchUnit.ts`, `src/levenshtein.ts`
- Tests: `tests/parseMeasurement.fuzzyUnits.test.ts`, `tests/matchUnit.closest.test.ts`,
  `tests/levenshtein.test.ts`
- Properties: "generated single measurements" in `tests/properties.test.ts`
- Corpus categories: `typos`
