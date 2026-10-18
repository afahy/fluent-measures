# Labels and text around a measurement

## What it does

The user gets the measurement from a sentence, a form field or a label, and ordinary words
don't become units.

## How a user reaches it

- Words around the measurement: `I weigh 150 lbs`, `weighed 70 kg in 2020`.
- Labels: `Height (in): 72`, `kg=72`, `in. 5`, `m: 1.8`, also after non-ASCII letters.
- A unit before a number in words: `kg seventy`.
- Commas, semicolons and long runs of periods between fields: `age=28, kg=72`, `180;lbs`.
- `import` and `require`.

## Where the rules are

- PARSING.md, "Units Before a Number"
- PARSING.md, "Labels"
- PARSING.md, "Semicolons"

## How to verify it

- Source: `src/tokenize.ts`, `src/parseMeasurement.ts`
- Tests: `tests/parseMeasurement.commaLabels.test.ts`, `tests/parseMeasurement.inPreposition.test.ts`,
  `tests/parseMeasurement.labelValues.test.ts`, `tests/parseMeasurement.longRuns.test.ts`,
  `tests/parseMeasurement.unicodeLabels.test.ts`, `tests/parseMeasurement.unitFirstPhrases.test.ts`,
  `tests/parseMeasurement.unitLabels.test.ts`, `tests/tokenize.test.ts`
- Corpus categories: `surrounding-text`, `prose`
