# More than one measurement

## What it does

The user gets the first measurement when the others agree with it within 1%, and `null` for a
range or for measurements that disagree.

## How a user reaches it

- A measurement and its conversion: `70 kg (154 lbs)`, `180 cm (5'11")`.
- Measurements that disagree: `210 lbs to 180 lbs`.
- Ranges: `150-180 lbs`, `kg 50-70`.
- `import` and `require`.

## Where the rules are

- README.md, "Limits"
- PARSING.md, "Ranges"
- PARSING.md, "More Than One Measurement"

## How to verify it

- Source: `src/parseMeasurement.ts`
- Tests: `tests/parseMeasurement.separateMeasurements.test.ts`
- Properties: "generated pairs of measurements" in `tests/properties.test.ts`
- Corpus categories: `multiple-measurements`
