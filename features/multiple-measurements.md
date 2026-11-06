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
- A height and a weight, with `type` to choose one: `5'11", 180 lbs`.
- `import` and `require`.

## Where the rules are

- README.md, "Limits"
- PARSING.md, "Ranges"
- PARSING.md, "More Than One Measurement"

## How to verify it

- Source: `src/parseMeasurement.ts`, `src/tokenize.ts`
- Tests: `tests/parseMeasurement.rangeUnits.test.ts`, `tests/parseMeasurement.separateMeasurements.test.ts`,
  `tests/parseMeasurement.numberWordCommas.test.ts`, `tests/parseMeasurement.commaBetweenWords.test.ts`,
  `tests/parseMeasurement.commaWeightOwnership.test.ts`
- Properties: "generated pairs of measurements" in `tests/properties.test.ts`
- Corpus categories: `multiple-measurements`
