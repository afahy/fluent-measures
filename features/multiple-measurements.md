# More than one measurement

## What it does

For text with more than one height, or more than one weight, the user gets the first one when the
others agree with it within 1%, and `null` for a range or for measurements that disagree. For text
with a height and a weight, `type` chooses which one the user gets. Without `type`, the result can
be either one, or `null`.

## How a user reaches it

- A measurement and its conversion: `70 kg (154 lbs)`, `180 cm (5'11")`.
- Measurements that disagree: `210 lbs to 180 lbs`.
- Ranges: `150-180 lbs`, `kg 50-70`. A separate measurement keeps its own unit, as in
  `150-180 lbs 70 kg` (70 kg).
- Spoken decimals next to discarded ranges: `6 ft 1-2 eleven point five in` gives 83.5 in;
  `kg seventy point five 1-2` keeps 70.5 kg.
- Shared-unit numeric ranges: `150 to 180 lbs`, `from 150 to 180 lbs`,
  `between 150 and 180 lbs`. Their endpoints are omitted with the same boundaries as dash ranges.
- A height and a weight, with `type` to choose one: `5'11", 180 lbs`.
- `import` and `require`.

## Where the rules are

- README.md, "Limits"
- PARSING.md, "Ranges"
- PARSING.md, "More Than One Measurement"

## How to verify it

- Source: `src/parseMeasurement.ts`, `src/tokenize.ts`
- Tests: `tests/parseMeasurement.compactUnits.test.ts`, `tests/parseMeasurement.spokenDecimalFields.test.ts`, `tests/parseMeasurement.spokenDecimalSemicolons.test.ts`, `tests/parseMeasurement.spokenDecimalReview.test.ts`, `tests/parseMeasurement.calculator.test.ts`, `tests/parseMeasurement.spokenDecimalBoundaries.test.ts`, `tests/parseMeasurement.unicodeMinusLabels.test.ts`, `tests/parseMeasurement.signedOtherTypeOwnership.test.ts`, `tests/parseMeasurement.signedWeightOwnership.test.ts`, `tests/parseMeasurement.quoteContext.test.ts`, `tests/parseMeasurement.fractionBoundaries.test.ts`, `tests/parseMeasurement.rangeUnits.test.ts`, `tests/parseMeasurement.separateMeasurements.test.ts`, `tests/parseMeasurement.wordedRangeBoundaries.test.ts`, `tests/parseMeasurement.wordedRanges.test.ts`,
  `tests/parseMeasurement.numberWordCommas.test.ts`, `tests/parseMeasurement.commaBetweenWords.test.ts`,
  `tests/parseMeasurement.commaWeightOwnership.test.ts`
- Properties: "generated pairs of measurements" in `tests/properties.test.ts`
- Corpus categories: `multiple-measurements`
