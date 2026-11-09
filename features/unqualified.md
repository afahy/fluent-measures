# Numbers with no unit

## What it does

With `defaultUnit`, the user gets a measurement from one complete number that has no unit.
The caller names its source unit; magnitude and output unit never choose it.

## How a user reaches it

- Each canonical `defaultUnit`: `ft`, `in`, `cm`, `m`, `lb`, `kg`, with or without `type`.
- A source default with an output unit: `72` with `defaultUnit: 'in'`, `normalizedUnit: 'cm'`
  gives 182.88 cm. An output unit alone leaves a bare number rejected.
- Values below and at the former metric threshold keep their unit: 2.99 and 3 in `cm` or `m`.
- Explicit units win over a default. A default alone does not select qualified input's dimension
  or enable height shorthand; that still requires `type: 'height'`.
- A source default must agree with a dimension selected by `type` or `normalizedUnit`.
- Invalid defaults and defined retired `allowUnqualified`/`inferUnit` options throw before input
  length/content; undefined retired properties are absent.
- Other text, a second number or a unit of the other type, which gives `null`: `180 giraffes`,
  `5 11`. A wrapper or trailing punctuation cannot be dropped: `about 80`, `(80)`, `80;`.
- `import` and `require`.

## Where the rules are

- README.md, "Usage"
- PARSING.md, "Numbers With No Unit"

## How to verify it

- Source: `src/parseMeasurement.ts`
- Tests: `tests/defaultUnitWork.test.ts`, `tests/parseMeasurement.defaultUnit.test.ts`, `tests/parseMeasurement.completeEntryQuoteSurvivors.test.ts`, `tests/parseMeasurement.completeEntry.test.ts`, `tests/parseMeasurement.completeEntryDecimals.test.ts`, `tests/parseMeasurement.completeEntryWork.test.ts`, `tests/numberReading.test.ts`, `tests/parseMeasurement.fractionBoundaries.test.ts`, `tests/parseMeasurement.rangeUnits.test.ts`, `tests/parseMeasurement.unqualifiedFallback.test.ts`, `tests/parseMeasurement.compactUnits.test.ts`, `tests/parseMeasurement.calculator.test.ts`, `tests/parseMeasurement.spokenDecimals.test.ts`, `tests/parseMeasurement.wordedRangeBoundaries.test.ts`, `tests/parseMeasurement.wordedRanges.test.ts`,
  `tests/parseMeasurement.conversionOverflow.test.ts`,
  `tests/parseMeasurement.conversionUnderflow.test.ts`,
  `tests/parseMeasurement.numberWordCommas.test.ts`, `tests/parseMeasurement.commaBetweenWords.test.ts`,
  `tests/parseMeasurement.unqualifiedMeters.test.ts`,
  `tests/parseMeasurement.unqualifiedNormalization.test.ts`
- Properties: "generated numbers with no unit" in `tests/properties.test.ts`
- Corpus categories: `unqualified`
