# Conversion to one unit

## What it does

The user gets the result in the unit that `normalizedUnit` names. The unit also selects the
measurement type.

## How a user reaches it

- `normalizedUnit` with a measurement of the same type: `5' 11"` to `cm`, `150 lbs` to `kg`.
- `normalizedUnit` with `type` of the other type, which throws an error.
- `normalizedUnit` with `allowUnqualified` and `type`: `72` with `type: 'height'` to `cm` gives
  182.88 cm. Without `type`, `allowUnqualified` throws an error (README.md, `ParseOptions`).
- `import` and `require`.

## Where the rules are

- README.md, "Usage"
- PARSING.md, "Numbers With No Unit"

## How to verify it

- Source: `src/units.ts`, `src/parseMeasurement.ts`
- Tests: `tests/parseMeasurement.unitConversions.test.ts`
- Properties: "generated single measurements" in `tests/properties.test.ts`
- Corpus categories: `conversion`
