# Feet and inches

## What it does

The user gets the total height in inches from feet and inches, with each part in `matches`.

## How a user reaches it

- Marks: `5'11"`, `5' 11"`, two apostrophes for inches, and Unicode quote marks.
- Unit names: `5 ft 11 in`, `5 feet 11 inches`, `five foot ten`.
- Hyphens: `5-foot-11`, `5 ft-11`, `5'-11"`.
- Shorthand with `type: 'height'`: `5-11`.
- Inches with no unit after the feet, from 1 to 11: `5 ft 11`.
- Compact units: `5ft11`, `5ft11in`, `6foot2` and `1m80`.
- Decimal commas in compact parts: `5ft11,5in` gives 71.5 inches and `1m80,5` gives 180.5 cm.
- Compact spoken parts and slash/range boundaries: `1m80 point five`, `ft5 eleven point five`, and rejection of the range in `5ft10/180 to 200 lbs`.
- Bare centimeters after meters: `1 m 80` and `one meter eighty` give 180 cm.
- Meters and centimeters as two parts of one height: `1 m 80 cm` gives 180 cm.
- A first part that isn't a whole number cannot form a compound: `5.5 ft 6 in` gives `null`.
- `import` and `require`.

## Where the rules are

- README.md, "Usage"
- PARSING.md, "More Than One Measurement"
- PARSING.md, "Feet and Inches"
- PARSING.md, "Hyphens"
- PARSING.md, "Shorthand"
- PARSING.md, "Compact Heights"

## How to verify it

- Source: `src/parseMeasurement.ts`, `src/tokenize.ts`
- Tests: `tests/parseMeasurement.completeEntryQuotes.test.ts`, `tests/parseMeasurement.completeEntryRoundThree.test.ts`, `tests/parseMeasurement.completeEntryRoundTwo.test.ts`, `tests/parseMeasurement.completeEntryReview.test.ts`, `tests/parseMeasurement.completeEntryPrefix.test.ts`, `tests/parseMeasurement.completeEntry.test.ts`, `tests/parseMeasurement.completeEntryDecimals.test.ts`, `tests/parseMeasurement.completeEntryWork.test.ts`, `tests/numberReading.test.ts`, `tests/numberReadingWork.test.ts`, `tests/parseMeasurement.duplicateReadings.test.ts`, `tests/parseMeasurement.quoteContext.test.ts`, `tests/parseMeasurement.fractionBoundaries.test.ts`, `tests/parseMeasurement.rangeUnits.test.ts`, `tests/parseMeasurement.bareInches.test.ts`, `tests/parseMeasurement.hyphens.test.ts`, `tests/parseMeasurement.compactUnits.test.ts`, `tests/parseMeasurement.spokenDecimalFields.test.ts`, `tests/parseMeasurement.spokenDecimalSemicolons.test.ts`, `tests/parseMeasurement.spokenDecimalReview.test.ts`, `tests/parseMeasurement.calculator.test.ts`, `tests/parseMeasurement.spokenDecimals.test.ts`, `tests/parseMeasurement.unicodeMinusLabels.test.ts`, `tests/parseMeasurement.wordedRangeBoundaries.test.ts`, `tests/parseMeasurement.wordedRanges.test.ts`,
  `tests/parseMeasurement.numberWordCommas.test.ts`, `tests/parseMeasurement.commaBetweenWords.test.ts`,
  `tests/parseMeasurement.hyphenReview.test.ts`, `tests/parseMeasurement.markHyphens.test.ts`,
  `tests/parseMeasurement.marksAfterWords.test.ts`, `tests/parseMeasurement.twoApostrophes.test.ts`,
  `tests/parseMeasurement.unicodeMarks.test.ts`
- Properties: "generated feet and inches" in `tests/properties.test.ts`
- Corpus categories: `symbols`, `hyphens`
