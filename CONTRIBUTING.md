# Contributing to fluent-measures

We love your input! We want to make contributing to fluent-measures as easy and transparent as possible. This library focuses on providing natural language parsing for height and weight measurements with support for both imperial and metric units.

## Development Process

1. Fork the repo and create your branch from `main`.
2. Install dependencies with `pnpm install`
3. Make your changes
4. Add tests if applicable
5. Run tests with `pnpm test`
6. Make sure your code lints with `pnpm lint`
7. Format your code with `pnpm lint:format:fix`
8. Create a changeset using `pnpm changeset`
9. Submit your pull request

## Commit Message Convention

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification. This means every commit message should be structured as follows:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

Types:

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that do not affect the meaning of the code
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `perf`: A code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `chore`: Changes to the build process or auxiliary tools

Examples:

- `feat: add metric to imperial conversion`
- `fix: handle negative measurements correctly`
- `docs: update API documentation`
- `test: add more test cases for edge values`

Pull request titles must use the same format. CI validates both every commit in the pull
request and its title with the rules in `commitlint.config.js`. Titles are also checked
against `commitlint.pr-title.config.js`: at most 65 characters, no Linear ticket ID, and none
of the formats commitlint skips for commits, such as `Merge branch …`, GitHub's default
`Revert "…"` title or `fixup! …`. To revert a change, use the `revert` type instead:
`revert: <original title>`.

## Project Structure

```
fluent-measures/
├── src/                  # Source code
│   ├── index.ts          # Main export file
│   └── types.ts          # TypeScript type definitions
│
├── tests/                # Test files
│
├── docs/                 # Documentation
│   ├── index.html        # Main documentation page
│   ├── tailwind.config.cjs  # Tailwind settings for the page
│   └── tailwind.css      # Tailwind CSS built for the page
│
└── [configuration files]
```

`docs/tailwind.css` holds the Tailwind CSS that the documentation page uses. Build it again when
you change a class in `docs/index.html` or a setting in `docs/tailwind.config.cjs`. Run these
commands from the repository root, then commit the new file:

```bash
pnpm dlx tailwindcss@3.4.17 -c docs/tailwind.config.cjs -o docs/tailwind.css
pnpm exec prettier --write docs/tailwind.css
```

`tests/docsPage.test.ts` fails if a class in a `class` attribute or a `classList` call on the page
has no rule in the file.

## Development Setup

Use Node.js 22.22.1 or later in 22.x, 24.11 or later in 24.x, or 26 or later. Use Git 2.32.0 or later. CI runs on Node.js 22 and 24. These development dependencies need these versions:

- Stryker's Babel packages: Node.js `^22.18.0 || >=24.11.0`.
- ESLint 10: Node.js `^20.19.0 || ^22.13.0 || >=24`.
- Changesets 3: Node.js `^22.11 || ^24 || >=26`.
- lint-staged 17, which the pre-commit hook runs: Node.js `>=22.22.1` and Git 2.32.0 or later.

```bash
# Clone the repository
git clone https://github.com/your-username/fluent-measures.git

# Install dependencies
pnpm install

# Run tests
pnpm test

# Run tests with coverage report
pnpm test:coverage

# Type checking
pnpm test:types

# Build the project
pnpm build

# Run in development mode (watch for changes)
pnpm dev

# Lint code
pnpm lint

# Format code
pnpm lint:format:fix

# Generate documentation
pnpm docs
```

## Pull Request Process

1. Update the README.md with details of changes if needed
2. Add tests for any new functionality
3. Make sure all tests pass (`pnpm test`) and types check (`pnpm test:types`)
4. Run linting and formatting (`pnpm lint` and `pnpm lint:format:fix`)
5. Create a changeset describing your changes (`pnpm changeset`)
6. Fill in every section of the pull request template (`.github/pull_request_template.md`), including the related issue or Linear ticket and the tests you ran. Don't replace the template with a different format
7. The PR will be merged once you have the sign-off of at least one maintainer

## Key Modules

### parseMeasurement.ts

The main entry point for parsing measurements. It processes input strings to extract height and weight measurements by coordinating with other modules.

### matchUnit.ts

Responsible for identifying and matching unit strings in the input (e.g., "ft", "cm", "lbs", etc.) with support for fuzzy matching.

### tokenize.ts

Splits input strings into tokens for processing, handling various formats and special character cases.

### units.ts

Contains unit definitions, aliases, and conversion functions between different units (imperial ↔ metric).

### wordsToNumber.ts

Parses spelled-out numbers into their numeric form (e.g., "eighty-five" → 85).

### levenshtein.ts

Provides fuzzy string matching capabilities using Levenshtein distance algorithm.

## Testing

We aim to maintain 100% test coverage. Each module should have a corresponding test file in the `tests/` directory. When adding new features or fixing bugs, please include tests that cover your changes.

Tests can be run with:

```bash
# Run all tests
pnpm test

# Run tests in watch mode during development
pnpm test:watch

# Generate test coverage report
pnpm test:coverage

# Run mutation testing
pnpm test:mutation
```

CI also runs mutation testing with Stryker on pull requests to `main` and on pushes to `main`.
Stryker makes small changes to the code in `src/`, such as flipping a condition or deleting a
statement, and runs the tests against each one. The mutation score is the percentage of these
changes that the tests catch. The job fails when the score is below the `break` threshold in
`stryker.config.json` (currently 70). The job output lists each change the tests missed. A
`Survived` entry means tests ran and still passed; a `NoCoverage` entry means no test runs that
code. Add tests that catch either kind.

A second job, "Mutants on changed lines are killed", runs Stryker on the files that a pull
request changes under `src/`. It fails when a mutant whose code overlaps a line that the pull
request adds or changes survives, or no test covers it. So the tests must catch every change to
the code that a pull request adds. To run it on your committed changes, use
`node .github/scripts/mutation-check.mjs --base origin/main`.

The job also fails for a changed source file that it can't check. It can't check a file in a
folder that Stryker never reads, such as `node_modules`. It also can't check a file whose path has
a backslash or a control character, or whose name isn't valid UTF-8. Rename or move such a file.

If a mutant can't change behavior, put `// Stryker disable next-line <mutator>: <reason>` on
the line above it. The reason must say why behavior can't change, and the job fails on a disable
comment without one. A line counts as changed even when only its formatting changes, so a pull
request that reformats or moves a line must also deal with any mutant on it that survives on
`main`.

Mutation testing uses Stryker, which depends on Babel 8. The Node.js versions under "Development
Setup" meet its requirements.

`vite` is in `devDependencies` because vitest needs it as a peer dependency. When you upgrade
vitest to a release that doesn't accept the installed vite major, raise the `vite` range in the
same change. If they don't match, `pnpm install` prints an `unmet peer vite` warning.

### Measurement corpus

The corpus measures how the parser does on the way people write heights and weights.
`tests/corpus/measurements.jsonl` holds the inputs, one entry on each line, with the outputs that
their writers meant. `tests/corpus.test.ts` runs `parseMeasurement` on each entry and builds a
report. The report has the outcome counts for all entries and for each category, and it lists each
entry that doesn't agree. The test compares the report with the Vitest snapshot in
`tests/__snapshots__/corpus.test.ts.snap`. This snapshot is the committed score of the parser.

Each entry is a JSON object with these fields:

- `id`: a short name that is unique and doesn't change, such as `unicode-curly-quotes-1`. Use
  lowercase letters and digits, with hyphens between words.
- `input`: the text to parse.
- `options`: the `parseMeasurement` options, if the input needs them.
- `expected`: `{ "value": 70, "unit": "kg", "type": "weight" }` or `null`. If more than one output
  is correct, use a list, such as `[{ "value": 70, "unit": "kg", "type": "weight" }, null]`.
- `category`: one of `symbols`, `words`, `mixed-numbers`, `decimals`, `commas`, `hyphens`,
  `compact`, `unicode`, `typos`, `surrounding-text`, `multiple-measurements`, `unqualified`,
  `conversion`, `unsupported` and `prose`.
- `source`: `handwritten`, a Linear ticket ID such as `AFA-15`, or the URL of the text.
- `note`: optional. Use it to explain an `expected` value that isn't clear from the input.

The test gives each entry one outcome:

- `agree`: `expected` accepts the output. Values agree when they differ by no more than a relative
  tolerance of 1e-9.
- `wrong`: the parser returns a measurement that `expected` doesn't accept.
- `missed`: the parser returns `null`, and `expected` doesn't accept `null`.
- `throws`: the parser throws an error.

To add an entry:

1. Write the input the way people write it. Write it yourself, or copy public text only when its
   license allows it. Don't add personal data.
2. Decide `expected` before you run the parser. Use what the writer meant. Follow the README when
   it covers the input. If the README leaves the choice between a value and `null` open, accept
   both.
3. Write exact values. Don't round them. Use 1 lb = 0.45359237 kg, 1 in = 2.54 cm and 1 ft = 12 in.
4. Don't add an input if its correct output depends on an open ticket.
5. Run `pnpm test:unit -u` to update the snapshot.
6. Read the snapshot diff. It must show only your new entries.

Update the snapshot with `pnpm test:unit -u` in these cases:

- You add entries. A new entry can have any outcome.
- A change to `src/` changes the output for an entry. Check each changed entry in the diff. If an
  entry moves to `agree`, the parser got better.

Don't change `expected` to make an entry agree with the parser. If an entry moves from `agree` to
another outcome, a test gets looser, which pull request rule 3 in `AGENTS.md` doesn't allow.
Make that change only when a ticket asks for it. If the snapshot changes and you don't know why,
find the cause before you update it.

The corpus test also fails when a line isn't valid JSON, two entries have the same `id`, a category
isn't in the list, or an expected unit doesn't belong to its type.

## Documentation

We use TypeDoc to generate API documentation. Please add proper JSDoc comments to all public functions and types:

````typescript
/**
 * Parses a measurement string into a structured object.
 *
 * @param input - The measurement string to parse
 * @param options - Optional configuration settings
 * @returns A parsed measurement object or null if parsing failed
 *
 * @example
 * ```ts
 * parseMeasurement('6 ft'); // { value: 6, unit: 'ft', type: 'height', raw: '6 ft' }
 * ```
 */
export function parseMeasurement(input: string, options: ParseOptions = {}): ParsedValue | null {
  // ...
}
````

You can generate the documentation locally with:

```bash
pnpm docs
```

## Performance Considerations

This library is designed to be lightweight and performant. When contributing, keep in mind:

1. **Bundle Size**: Avoid adding dependencies when possible. Each build, `dist/index.js` and
   `dist/index.cjs`, has a budget of 4 kB after minifying and compressing with Brotli. The
   limits are set in `.size-limit.cjs`, and if this note disagrees with that file, the file is
   right. CI fails when a build goes over its budget. To check, run `pnpm build` and then
   `pnpm check:size`. To see how much minified code each source file adds, run
   `pnpm exec tsup --metafile` and load `dist/metafile-esm.json` into
   [esbuild's bundle analyzer](https://esbuild.github.io/analyze/). `pnpm check:size:why` can't
   show this, because it only sees the built file. Raising the budget needs its own ticket, so
   don't raise it as part of another change.
2. **Algorithmic Complexity**: Be mindful of performance in parsing algorithms.
3. **Memory Usage**: Avoid unnecessary object creation in hot paths.

## Any contributions you make will be under the MIT Software License

In short, all your submissions to fluent-measures will be under the same [MIT License](LICENSE) that covers the project.
