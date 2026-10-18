# Numbers with no unit

## What it does

With `allowUnqualified`, the user gets a measurement from a number that has no unit. `inferUnit`
selects the unit system.

## How a user reaches it

- `allowUnqualified` with `type`: `72` as a height, `150` as a weight.
- `inferUnit: 'metric'` or `inferUnit: 'imperial'`.
- Other text, a second number or a unit of the other type, which gives `null`: `180 giraffes`,
  `5 11`.
- `import` and `require`.

## Where the rules are

- README.md, "Usage"
- PARSING.md, "Numbers With No Unit"

## How to verify it

- Source: `src/parseMeasurement.ts`
- Tests: `tests/parseMeasurement.unqualifiedFallback.test.ts`,
  `tests/parseMeasurement.unqualifiedMeters.test.ts`,
  `tests/parseMeasurement.unqualifiedNormalization.test.ts`
- Properties: "generated numbers with no unit" in `tests/properties.test.ts`
- Corpus categories: `unqualified`
