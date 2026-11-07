# Labels and text around a measurement

## What it does

The user gets the measurement from a sentence, a form field or a label, and ordinary words
don't become units.

## How a user reaches it

- Words around the measurement: `I weigh 150 lbs`, `weighed 70 kg in 2020`.
- Labels: `Height (in): 72`, `kg=72`, `in. 5`, `m: 1.8`, also after non-ASCII letters.
- A unit before a number in words: `kg seventy`.
- Commas, semicolons and long runs of periods between fields: `age=28, kg=72`, `180;lbs`.
- Explicit suffix ownership before inferring bare centimeters: `1 m 80;kg`, `1 m 80 (m)`.
- A label ending in a number word before a comma and words: `age one, twenty pounds` gives 20 lb.
- A label ending in a number word before a comma and digits: `phase twenty, 5 cm` gives 5 cm.
- `import` and `require`.

## Where the rules are

- PARSING.md, "Units Before a Number"
- PARSING.md, "Labels"
- PARSING.md, "Semicolons"

## How to verify it

- Source: `src/tokenize.ts`, `src/parseMeasurement.ts`
- Tests: `tests/parseMeasurement.compactUnits.test.ts`, `tests/parseMeasurement.spokenDecimalFields.test.ts`, `tests/parseMeasurement.spokenDecimalSemicolons.test.ts`, `tests/parseMeasurement.spokenDecimalReview.test.ts`, `tests/parseMeasurement.calculator.test.ts`, `tests/parseMeasurement.spokenDecimalBoundaries.test.ts`, `tests/parseMeasurement.spokenDecimals.test.ts`, `tests/parseMeasurement.unicodeMinusCost.test.ts`, `tests/parseMeasurement.unicodeMinusLabels.test.ts`, `tests/parseMeasurement.signedOtherTypeOwnership.test.ts`, `tests/parseMeasurement.signedWeightOwnership.test.ts`, `tests/parseMeasurement.quoteContext.test.ts`, `tests/parseMeasurement.fractionBoundaries.test.ts`, `tests/parseMeasurement.rangeUnits.test.ts`, `tests/parseMeasurement.commaLabels.test.ts`, `tests/parseMeasurement.inPreposition.test.ts`, `tests/parseMeasurement.wordedRangeBoundaries.test.ts`, `tests/parseMeasurement.wordedRanges.test.ts`,
  `tests/parseMeasurement.numberWordCommas.test.ts`, `tests/parseMeasurement.commaBetweenWords.test.ts`,
  `tests/parseMeasurement.commaWeightOwnership.test.ts`,
  `tests/parseMeasurement.labelValues.test.ts`, `tests/parseMeasurement.longRuns.test.ts`,
  `tests/parseMeasurement.unicodeLabels.test.ts`, `tests/parseMeasurement.unitFirstPhrases.test.ts`,
  `tests/parseMeasurement.unitLabels.test.ts`, `tests/tokenize.test.ts`
- Properties: "generated number phrases" in `tests/properties.test.ts`
- Properties: "generated label ownership" in `tests/properties.test.ts`
- Corpus categories: `surrounding-text`, `prose`
