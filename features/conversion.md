# Conversion to one unit

## What it does

The user gets the result in the unit that `normalizedUnit` names. The unit also selects the
measurement type.

## How a user reaches it

- `normalizedUnit` with a measurement of the same type: `5' 11"` to `cm`, `150 lbs` to `kg`.
- `normalizedUnit` with `type` of the other type, which throws an error.
- `normalizedUnit` with `defaultUnit`: `72` with `defaultUnit: 'in'` to `cm` gives 182.88 cm.
  A default of the other dimension throws, even for input with explicit units.
- `import` and `require`.

## Where the rules are

- README.md, "Usage"
- PARSING.md, "Numbers With No Unit"

## How to verify it

- Source: `src/units.ts`, `src/parseMeasurement.ts`
- Tests: `tests/parseMeasurement.defaultUnit.test.ts`, `tests/parseMeasurement.completeEntryPrefix.test.ts`, `tests/parseMeasurement.completeEntry.test.ts`, `tests/parseMeasurement.completeEntryDecimals.test.ts`, `tests/parseMeasurement.completeEntryWork.test.ts`, `tests/numberReading.test.ts`, `tests/numberReadingWork.test.ts`, `tests/parseMeasurement.duplicateReadings.test.ts`, `tests/parseMeasurement.signedOtherTypeOwnership.test.ts`, `tests/parseMeasurement.signedWeightOwnership.test.ts`, `tests/parseMeasurement.fractionBoundaries.test.ts`, `tests/parseMeasurement.rangeUnits.test.ts`, `tests/parseMeasurement.unitConversions.test.ts`, `tests/parseMeasurement.compactUnits.test.ts`, `tests/parseMeasurement.spokenDecimalReview.test.ts`, `tests/parseMeasurement.calculator.test.ts`, `tests/parseMeasurement.spokenDecimals.test.ts`, `tests/parseMeasurement.wordedRanges.test.ts`,
  `tests/parseMeasurement.conversionOverflow.test.ts`,
  `tests/parseMeasurement.conversionUnderflow.test.ts`,
  `tests/parseMeasurement.numberWordCommas.test.ts`
- Properties: "generated single measurements" in `tests/properties.test.ts`
- Properties: "generated number phrases" in `tests/properties.test.ts`
- Properties: "generated normalized type selection" in `tests/properties.test.ts`
- Properties: "generated numbers with no unit" in `tests/properties.test.ts`
- Properties: "generated feet and inches" in `tests/properties.test.ts`
- Properties: "generated pairs of measurements" in `tests/properties.test.ts`
- Corpus categories: `conversion`
