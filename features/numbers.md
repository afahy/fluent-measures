# Numbers

## What it does

The user gets the value of a number in digits, in words, or in words and digits, with decimals,
fractions, decimal commas and thousands groups.

## How a user reaches it

- Decimals: `72.5 kg`, `.5 m`.
- Spoken decimals: `seventy point five kilograms`, `kg point five`; malformed decimal phrases
  return `null` rather than a numeric suffix.
- Words: `eighty kilograms`, `one hundred and 50 pounds`, `six and a half feet`.
- Fractions: `5 1/2 ft`, `5½ ft`.
- Commas: `1,000 lbs`, `72,5 kg`, `1,234,56 kg`.
- A comma between number words: `my son is two, thirty pounds` gives 30 lb.
- A comma and space after a label's number word: `phase twenty, 5 cm` gives 5 cm.
- Signs, which give `null` for a negative value: `-70 kg`, Unicode minus signs.
- A zero before a unit, which isn't a measurement: `0 kg, 80 lb` gives 80 lb.
- `import` and `require`.

## Where the rules are

- README.md, "Usage"
- PARSING.md, "Numbers"
- PARSING.md, "Commas"

## How to verify it

- Source: `src/wordsToNumber.ts`, `src/tokenize.ts`, `src/parseMeasurement.ts`
- Tests: `tests/parseMeasurement.spokenDecimalBoundaries.test.ts`, `tests/parseMeasurement.spokenDecimals.test.ts`, `tests/parseMeasurement.signedOtherTypeOwnership.test.ts`, `tests/parseMeasurement.signedWeightOwnership.test.ts`, `tests/parseMeasurement.quoteContext.test.ts`, `tests/parseMeasurement.fractionBoundaries.test.ts`, `tests/parseMeasurement.rangeUnits.test.ts`, `tests/parseMeasurement.andAHalf.test.ts`, `tests/parseMeasurement.commaBoundaries.test.ts`,
  `tests/parseMeasurement.numberWordCommas.test.ts`, `tests/parseMeasurement.commaBetweenWords.test.ts`,
  `tests/parseMeasurement.commaWeightOwnership.test.ts`,
  `tests/parseMeasurement.commaFractions.test.ts`, `tests/parseMeasurement.commaGroups.test.ts`,
  `tests/parseMeasurement.commaSyntax.test.ts`, `tests/parseMeasurement.commas.test.ts`,
  `tests/parseMeasurement.fractions.test.ts`, `tests/parseMeasurement.numberWords.test.ts`,
  `tests/parseMeasurement.signedParts.test.ts`, `tests/parseMeasurement.spokenNumbers.test.ts`,
  `tests/parseMeasurement.unicodeMinus.test.ts`, `tests/parseMeasurement.zeroBeforeUnit.test.ts`,
  `tests/wordsToNumber.test.ts`, `tests/wordsToNumberTable.test.ts`, `tests/normalizeForms.test.ts`,
  `tests/normalizeFractions.test.ts`
- Properties: "generated single measurements" in `tests/properties.test.ts`
- Properties: "generated number phrases" in `tests/properties.test.ts`
- Corpus categories: `words`, `mixed-numbers`, `decimals`, `commas`
