# Feet and inches

## What it does

The user gets the total height in inches from feet and inches, with each part in `matches`.

## How a user reaches it

- Marks: `5'11"`, `5' 11"`, two apostrophes for inches, and Unicode quote marks.
- Unit names: `5 ft 11 in`, `5 feet 11 inches`, `five foot ten`.
- Hyphens: `5-foot-11`, `5 ft-11`, `5'-11"`.
- Shorthand with `type: 'height'`: `5-11`.
- Inches with no unit after the feet, from 1 to 11: `5 ft 11`.
- `import` and `require`.

## Where the rules are

- README.md, "Usage"
- PARSING.md, "Feet and Inches"
- PARSING.md, "Hyphens"
- PARSING.md, "Shorthand"

## How to verify it

- Source: `src/parseMeasurement.ts`, `src/tokenize.ts`
- Tests: `tests/parseMeasurement.bareInches.test.ts`, `tests/parseMeasurement.hyphens.test.ts`,
  `tests/parseMeasurement.hyphenReview.test.ts`, `tests/parseMeasurement.markHyphens.test.ts`,
  `tests/parseMeasurement.marksAfterWords.test.ts`, `tests/parseMeasurement.twoApostrophes.test.ts`,
  `tests/parseMeasurement.unicodeMarks.test.ts`
- Properties: "generated feet and inches" in `tests/properties.test.ts`
- Corpus categories: `symbols`, `hyphens`
