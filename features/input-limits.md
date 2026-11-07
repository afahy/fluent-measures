# Input type and length limits

## What it does

The parser returns `null` for non-string input at runtime, or for a string longer than the raw
input length limit. The public TypeScript input parameter stays `string`.

## How a user reaches it

- Non-string values, including null, undefined, arrays, objects and boxed strings, return `null`
  before reading options or processing the input.
- Omitting `maxLength`, or setting it to undefined, uses 1,000 UTF-16 code units. The exact
  boundary is accepted; trailing spaces count before trimming or normalization.
- A custom `maxLength` accepts numbers of at least 1, including fractions, or `Infinity` to
  disable the limit. Each string above the limit returns `null` before other parsing options.
- Invalid `maxLength` values throw an error whose message doesn't contain the supplied value.
  Within the length limit, nonempty string input with null options still throws; empty or
  whitespace-only input returns `null`, as before.
- `import` and `require`.

## Where the rules are

- README.md, "API reference"
- README.md, "Troubleshooting"

## How to verify it

- Source: `src/parseMeasurement.ts`, `src/types.ts`
- Tests: `tests/parseMeasurement.compactUnits.test.ts`, `tests/parseMeasurement.calculator.test.ts`,
  `tests/parseMeasurement.inputLimits.test.ts`, `tests/timing.test.ts`
- The existing long-input tests use `maxLength: Infinity` to continue exercising parsing and
  performance with their original inputs, expected results and time limits.
- The corpus's surrounding-text length boundary and override entries cover the string inputs.
