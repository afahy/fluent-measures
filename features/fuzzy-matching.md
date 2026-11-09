# Exact unit names

## What it does

The user gets a measurement only when each unit name is a listed unit or alias. A misspelled unit
name returns `null`, and the user fixes the entry and submits it again. The parser doesn't
suggest corrections or change numbers.

## How a user reaches it

- An exact alias in any letter case, including `kilogramme` and `kilogrammes`: `95 kilogrammes`.
- A misspelled unit name: `5 foots 10 inc`, `70.50 kilgrm` and `6 feat` return `null`.
- An ordinary word near a unit name: `I paid 5 fees`, `we visited 2 ponds` and
  `the studio has 2 kilns` return `null`.
- A misspelled unit name beside a valid measurement, as in `5 ft; 70 kilgrm` with
  `type: 'height'`: `null`.
- The entry that the user fixed: `5 foot 10 inches` is 70 in.
- A defined `fuzziness`, even `0`, `false` or `Infinity`, throws. An `undefined` value is absent.
- `import` and `require`.

## Where the rules are

- README.md, "Usage"
- README.md, "API reference"
- PARSING.md, "Exact Unit Names"

## How to verify it

- Source: `src/matchUnit.ts`, `src/units.ts`, `src/parseMeasurement.ts`
- Tests: `tests/parseMeasurement.completeEntry.test.ts`, `tests/parseMeasurement.completeEntryWork.test.ts`, `tests/numberReading.test.ts`, `tests/parseMeasurement.signedOtherTypeOwnership.test.ts`, `tests/parseMeasurement.signedWeightOwnership.test.ts`, `tests/parseMeasurement.rangeUnits.test.ts`, `tests/parseMeasurement.fuzzyUnits.test.ts`, `tests/matchUnit.test.ts`, `tests/parseMeasurement.calculator.test.ts`, `tests/parseMeasurement.wordedRanges.test.ts`,
  `tests/parseMeasurement.numberWordCommas.test.ts`, `tests/parseMeasurement.commaBetweenWords.test.ts`
- Properties: "generated single measurements" in `tests/properties.test.ts`
- Corpus categories: `typos`

AFA-253 replaced fuzzy matching with exact unit names, by the maintainer's decision. This
overrides AFA-216, which kept the fuzzy example `5 foots 10 inc` with `fuzziness: 2` as 70 in.
