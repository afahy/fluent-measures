# Labels and text around a measurement

## What it does

The user gets one complete measurement after a finite introduction or approximation word.
Unknown fields, arbitrary prose and fragments reject the whole entry.

## How a user reaches it

- Finite wrappers: `I weigh 150 lbs`, `I'm five foot eleven`, `about 180 cm`.
- Directional labels: `Height (in): 72`, `kg=72`, `in. 5`, `m: 1.8`.
- A unit before a complete number phrase: `kg seventy two`.
- One balanced recognized wrapper around a number or entry, preserving all content.
- Unrelated fields and interrupted expressions reject: `age=28, kg=72`, `180;lbs`,
  `phase twenty, 5 cm`, `weighed 70 kg in 2020`.
- Explicit suffixes cannot be ignored for bare centimeters: `1 m 80;kg` and `1 m 80 (m)` reject.
- `import` and `require`.

## Where the rules are

- PARSING.md, "Surrounding Words"
- PARSING.md, "Units Before a Number"
- PARSING.md, "Labels"
- PARSING.md, "Semicolons"

## How to verify it

- Source: `src/tokenize.ts`, `src/parseMeasurement.ts`
- Tests: `tests/parseMeasurement.curlyQuoteOwnership.test.ts`, `tests/parseMeasurement.curlyScalarClose.test.ts`, `tests/parseMeasurement.curlyEntryClose.test.ts`, `tests/parseMeasurement.curlyEntryCloseCost.test.ts`, `tests/curlyEntryCloseTokens.test.ts`, `tests/parseMeasurement.completeEntryRoundFive.test.ts`, `tests/parseMeasurement.completeEntryQuoteSurvivors.test.ts`, `tests/parseMeasurement.completeEntryQuotes.test.ts`, `tests/parseMeasurement.completeEntryRoundThree.test.ts`, `tests/parseMeasurement.completeEntryRoundTwo.test.ts`, `tests/parseMeasurement.completeEntryReview.test.ts`, `tests/parseMeasurement.completeEntryPrefix.test.ts`, `tests/parseMeasurement.completeEntry.test.ts`, `tests/parseMeasurement.completeEntryDecimals.test.ts`, `tests/parseMeasurement.completeEntryWork.test.ts`, `tests/numberReading.test.ts`, `tests/numberReadingWork.test.ts`, `tests/parseMeasurement.duplicateReadings.test.ts`, `tests/parseMeasurement.signedOtherTypeOwnership.test.ts`, `tests/parseMeasurement.signedWeightOwnership.test.ts`, `tests/parseMeasurement.quoteContext.test.ts`, `tests/parseMeasurement.fractionBoundaries.test.ts`, `tests/parseMeasurement.rangeUnits.test.ts`, `tests/parseMeasurement.commaLabels.test.ts`, `tests/parseMeasurement.inPreposition.test.ts`, `tests/parseMeasurement.compactUnits.test.ts`, `tests/parseMeasurement.spokenDecimalFields.test.ts`, `tests/parseMeasurement.spokenDecimalSemicolons.test.ts`, `tests/parseMeasurement.spokenDecimalReview.test.ts`, `tests/parseMeasurement.calculator.test.ts`, `tests/parseMeasurement.spokenDecimalBoundaries.test.ts`, `tests/parseMeasurement.spokenDecimals.test.ts`, `tests/parseMeasurement.unicodeMinusCost.test.ts`, `tests/parseMeasurement.unicodeMinusLabels.test.ts`, `tests/parseMeasurement.wordedRangeBoundaries.test.ts`, `tests/parseMeasurement.wordedRanges.test.ts`,
  `tests/parseMeasurement.numberWordCommas.test.ts`, `tests/parseMeasurement.commaBetweenWords.test.ts`,
  `tests/parseMeasurement.commaWeightOwnership.test.ts`,
  `tests/parseMeasurement.labelValues.test.ts`, `tests/parseMeasurement.longRuns.test.ts`,
  `tests/parseMeasurement.unicodeLabels.test.ts`, `tests/parseMeasurement.unitFirstPhrases.test.ts`,
  `tests/parseMeasurement.unitLabels.test.ts`, `tests/tokenize.test.ts`
- Properties: "generated number phrases" in `tests/properties.test.ts`
- Properties: "generated rejection of unrelated fields" in `tests/properties.test.ts`
- Corpus categories: `surrounding-text`, `prose`
