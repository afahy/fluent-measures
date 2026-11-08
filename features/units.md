# Units and unit names

<!-- cspell:ignore centimetres -->

## What it does

The user gets the value and the unit of a height or a weight, from a short or a long unit name,
or from a mark such as `#` for pounds. A weight with a part in stone, ounces or grams gives
`null`, as in `12st 4lb`. Any unsupported fragment or unrelated prose invalidates the entry,
including `I drink 8 oz of water, weight 180 lbs`.

## How a user reaches it

- A number and a unit name, with or without a space: `6 ft`, `150lbs`, `72 inches`, `185#`.
- A unit before its number: `kg 70`.
- An unsupported unit before its own number, also in words before a comma: `stone twenty, 4 lb`
  gives `null`.
- Short plurals: `70kgs` and `175cms`.
- British spellings: `1.8 metres`, `180 centimetres`.
- `type: 'height'` or `type: 'weight'`, to select from a fully valid entry.
- `import` and `require`.

## Where the rules are

- README.md, "Usage"
- README.md, "Supported units"
- README.md, "Limits"
- PARSING.md, "Unsupported Units"

## How to verify it

- Source: `src/units.ts`, `src/matchUnit.ts`, `src/tokenize.ts`, `src/parseMeasurement.ts`
- Tests: `tests/parseMeasurement.completeEntryRoundFive.test.ts`, `tests/parseMeasurement.completeEntryQuoteSurvivors.test.ts`, `tests/parseMeasurement.completeEntryQuotes.test.ts`, `tests/parseMeasurement.completeEntryRoundTwo.test.ts`, `tests/parseMeasurement.completeEntry.test.ts`, `tests/parseMeasurement.completeEntryWork.test.ts`, `tests/numberReading.test.ts`, `tests/parseMeasurement.signedOtherTypeOwnership.test.ts`, `tests/parseMeasurement.signedWeightOwnership.test.ts`, `tests/parseMeasurement.quoteContext.test.ts`, `tests/parseMeasurement.fractionBoundaries.test.ts`, `tests/parseMeasurement.rangeUnits.test.ts`, `tests/parseMeasurement.test.ts`, `tests/parseMeasurement.britishUnits.test.ts`, `tests/parseMeasurement.compactUnits.test.ts`, `tests/parseMeasurement.calculator.test.ts`, `tests/parseMeasurement.spokenDecimals.test.ts`, `tests/parseMeasurement.unicodeMinusCost.test.ts`, `tests/parseMeasurement.unicodeMinusLabels.test.ts`, `tests/parseMeasurement.wordedRangeBoundaries.test.ts`, `tests/parseMeasurement.wordedRanges.test.ts`,
  `tests/parseMeasurement.conversionOverflow.test.ts`,
  `tests/parseMeasurement.numberWordCommas.test.ts`, `tests/parseMeasurement.commaBetweenWords.test.ts`,
  `tests/parseMeasurement.commaWeightOwnership.test.ts`,
  `tests/parseMeasurement.inAfterNumber.test.ts`, `tests/parseMeasurement.unsupportedUnits.test.ts`,
  `tests/units.test.ts`, `tests/matchUnit.test.ts`
- Properties: "generated single measurements" in `tests/properties.test.ts`
- Corpus categories: `compact`, `unicode`, `unsupported`
