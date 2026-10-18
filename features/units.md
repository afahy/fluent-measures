# Units and unit names

<!-- cspell:ignore centimetres -->

## What it does

The user gets the value and the unit of a height or a weight, from a short or a long unit name,
or from a mark such as `#` for pounds. A weight with a part in stone, ounces or grams gives
`null`, as in `12st 4lb`. An amount in these units in another part of the text doesn't count, as
in `I drink 8 oz of water, weight 180 lbs`, which gives 180 lb.

## How a user reaches it

- A number and a unit name, with or without a space: `6 ft`, `150lbs`, `72 inches`, `185#`.
- A unit before its number: `kg 70`.
- British spellings: `1.8 metres`, `180 centimetres`.
- `type: 'height'` or `type: 'weight'`, to read only one type.
- `import` and `require`.

## Where the rules are

- README.md, "Usage"
- README.md, "Supported Units"
- README.md, "Limits"
- PARSING.md, "Unsupported Units"

## How to verify it

- Source: `src/units.ts`, `src/matchUnit.ts`, `src/tokenize.ts`
- Tests: `tests/parseMeasurement.test.ts`, `tests/parseMeasurement.britishUnits.test.ts`,
  `tests/parseMeasurement.inAfterNumber.test.ts`, `tests/parseMeasurement.unsupportedUnits.test.ts`,
  `tests/units.test.ts`, `tests/matchUnit.test.ts`
- Properties: "generated single measurements" in `tests/properties.test.ts`
- Corpus categories: `compact`, `unicode`, `unsupported`
