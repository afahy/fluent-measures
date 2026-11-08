# More than one measurement

## What it does

Independent readings of one dimension return `null`, regardless of agreement. Feet/inch and
meter/centimeter compounds still form one measurement. Exactly one complete height and weight
requires `type` or `normalizedUnit` to select one; without a selector the result is `null`.

## How a user reaches it

- Duplicate readings reject even when they agree: `70 kg (154 lbs)`, `180 cm (5'11")`.
- Ranges reject the whole entry: `150-180 lbs 70 kg`, `6 ft 1-2 eleven point five in`,
  `kg seventy point five 1-2`, `150 to 180 lbs`, `from 150 to 180 lbs`, `between 150 and 180 lbs`.
- Exactly one valid expression per dimension with a selector: `5'11", 180 lbs`.
- `import` and `require`.

## Where the rules are

- README.md, "Limits"
- PARSING.md, "Complete Entries"
- PARSING.md, "Ranges"
- PARSING.md, "More Than One Measurement"

## How to verify it

- Source: `src/parseMeasurement.ts`, `src/tokenize.ts`
- Tests: `tests/parseMeasurement.completeEntryQuotes.test.ts`, `tests/parseMeasurement.completeEntryRoundThree.test.ts`, `tests/parseMeasurement.completeEntryRoundTwo.test.ts`, `tests/parseMeasurement.completeEntryReview.test.ts`, `tests/parseMeasurement.completeEntryPrefix.test.ts`, `tests/parseMeasurement.completeEntry.test.ts`, `tests/parseMeasurement.completeEntryDecimals.test.ts`, `tests/parseMeasurement.completeEntryWork.test.ts`, `tests/numberReading.test.ts`, `tests/numberReadingWork.test.ts`, `tests/parseMeasurement.duplicateReadings.test.ts`, `tests/parseMeasurement.signedOtherTypeOwnership.test.ts`, `tests/parseMeasurement.signedWeightOwnership.test.ts`, `tests/parseMeasurement.quoteContext.test.ts`, `tests/parseMeasurement.fractionBoundaries.test.ts`, `tests/parseMeasurement.rangeUnits.test.ts`, `tests/parseMeasurement.separateMeasurements.test.ts`, `tests/parseMeasurement.compactUnits.test.ts`, `tests/parseMeasurement.spokenDecimalFields.test.ts`, `tests/parseMeasurement.spokenDecimalSemicolons.test.ts`, `tests/parseMeasurement.spokenDecimalReview.test.ts`, `tests/parseMeasurement.calculator.test.ts`, `tests/parseMeasurement.spokenDecimalBoundaries.test.ts`, `tests/parseMeasurement.unicodeMinusLabels.test.ts`, `tests/parseMeasurement.wordedRangeBoundaries.test.ts`, `tests/parseMeasurement.wordedRanges.test.ts`,
  `tests/parseMeasurement.numberWordCommas.test.ts`, `tests/parseMeasurement.commaBetweenWords.test.ts`,
  `tests/parseMeasurement.commaWeightOwnership.test.ts`
- Properties: "generated pairs of measurements" in `tests/properties.test.ts`
- Corpus categories: `multiple-measurements`
