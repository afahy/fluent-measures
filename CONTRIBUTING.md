# Contributing to fluent-measures

We love your input! We want to make contributing to fluent-measures as easy and transparent as possible. This library focuses on providing natural language parsing for height and weight measurements with support for both imperial and metric units.

## Development Process

1. Fork the repo and create your branch from `main`.
2. Install dependencies with `pnpm install`
3. Make your changes
4. Add tests if applicable
5. Run tests with `pnpm test`, and check coverage with `pnpm test:unit:coverage`
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
│   ├── site.css          # Styles for the page, which you edit
│   ├── tailwind.config.cjs  # Tailwind settings that copy site.css into tailwind.css
│   └── tailwind.css      # CSS built from site.css, which the page loads
│
├── README.md             # Basic use and API reference
├── PARSING.md            # Parsing rules, with examples
│
└── [configuration files]
```

### Docs page

The styles of the documentation page are in `docs/site.css`. The page doesn't load that file. It
loads `docs/tailwind.css`, which the build copies from `site.css`, rule by rule, with the settings
in `docs/tailwind.config.cjs`. So build `tailwind.css` again each time you change `site.css` or
the settings. Run these commands from the repository root, then commit both files:

```bash
pnpm dlx tailwindcss@3.4.17 -c docs/tailwind.config.cjs -o docs/tailwind.css
pnpm exec prettier --write docs/tailwind.css
```

`tests/docsPage.test.ts` fails if a class in a `class` attribute or a `classList` call on the page
has no rule in `tailwind.css`.

Two scripts check the page in your installed Chrome or Chromium, so they need no other package.
If they can't find it, set `CHROME_PATH` to its binary. Each script takes the page as its first
argument and defaults to `docs/index.html`. A URL, such as `http://localhost:8080/`, works too.

- `pnpm docs:sweep` loads the page in light and dark, and resizes it through each width from
  320 to 1600px. It reports layout problems at each width: a sideways scroll on the page or in a
  code block, content that a box clips or that runs off the screen, input chips that run into
  their results or into the hero demo's arrows, values that wrap, and a header or navigation that
  is missing, too tall or collides. It checks each width again with the hero demo expanded, and
  marks a problem that only the expanded card has with `[expanded]`. From 1024px, it also reports
  an expanded card that isn't as tall as the collapsed one. Each line names a problem and the
  widths where it appears. The script exits 1 when it finds a problem, and 2 when it can't run.
  Run it after each change to `docs/` and before you open the PR. `--from`, `--to` and `--step`
  change the widths, and `--touch` emulates a touch screen. The checks use the page's class
  names, so when you rename a class that `.github/scripts/docs-sweep.mjs` names, change the
  script too.
- `pnpm docs:shot` takes a screenshot at a device width. Headless Chrome can't make a window
  narrower than about 500px, so the script emulates the device instead, and a 390px phone
  screenshot is correct. It defaults to 390 by 844px in light, at twice the pixel density, and
  writes `docs-shots/<width>-<scheme>.png`, which git ignores. `--width`, `--height`,
  `--scheme dark` and `--out <file>` change these. `--full` takes the whole page, at the normal
  density, and adds `-full` to the file name.

For example, `pnpm docs:shot --width 1440 --scheme dark --full` takes the whole page at desktop
width in dark, and writes `docs-shots/1440-dark-full.png`.

## Development Setup

Use Node.js 22.22.1 or later in 22.x, 24.11 or later in 24.x, or 26 or later. Use Git 2.32.0 or later. CI runs on Node.js 22 and 24. These development dependencies need these versions:

- Stryker's Babel packages: Node.js `^22.18.0 || >=24.11.0`.
- ESLint 10: Node.js `^20.19.0 || ^22.13.0 || >=24`.
- Changesets 3: Node.js `^22.11 || ^24 || >=26`.
- lint-staged 17, which the pre-commit hook runs: Node.js `>=22.22.1` and Git 2.32.0 or later.

The git hooks run pnpm. When pnpm isn't on PATH, as in some shells that tools start, the hooks
run `corepack pnpm`, or else `npx pnpm@<version>` with the version in the `packageManager` field
(`.husky/_pnpm.sh` and `.husky/bin/pnpm`). They print an error only when neither works.

```bash
# Clone your fork of the repository
git clone https://github.com/your-username/fluent-measures.git

# Install dependencies
pnpm install

# Run tests
pnpm test

# Run tests with coverage report
pnpm test:unit:coverage

# Type checking
pnpm test:types

# Build the project
pnpm build

# Check the exported types against api-report.d.ts, after the build
pnpm check:api

# Run the tests of results against the build, through import and require
pnpm test:package

# Run in development mode (watch for changes)
pnpm dev

# Lint code
pnpm lint

# Format code
pnpm lint:format:fix
```

## Pull Request Process

1. If a change affects users, update `README.md` or `PARSING.md`
2. Add tests for any new functionality
3. Make sure all tests pass (`pnpm test`), coverage stays at 100% (`pnpm test:unit:coverage`)
   and types check (`pnpm test:types`)
4. Run linting and formatting (`pnpm lint` and `pnpm lint:format:fix`)
5. Create a changeset describing your changes (`pnpm changeset`)
6. Fill in every section of the pull request template (`.github/pull_request_template.md`), including the related issue or Linear ticket and the tests you ran. Don't replace the template with a different format
7. The PR will be merged once you have the sign-off of at least one maintainer

### Automated Reviews

Codex reviews each push to a pull request. Claude reviews once, when a pull request opens or
becomes ready for review (`.github/workflows/claude-review.yml`). The Claude review posts comments
only and blocks no merge. Claude posts its inline comments, and `github-actions` posts its summary.

The Claude review doesn't run on a pull request that changes `claude-review.yml`, because the
action stops when that file differs from the one on `main`. The check stays green. Put a change to
the workflow in its own pull request, so that the other changes get a review.

## Key Modules

### parseMeasurement.ts

The main entry point for parsing measurements. It processes input strings to extract height and weight measurements by coordinating with other modules.

### matchUnit.ts

Responsible for identifying and matching unit strings in the input (e.g., "ft", "cm", "lbs", etc.) with support for fuzzy matching.

### tokenize.ts

Splits input strings into tokens for processing, handling various formats and special character cases. Each token is an object with its text. A label, such as "(kg)" or "in:", is one token that also gives the kind of label and whether it starts a field. The parser sets a flag on each token that a measurement uses.

### units.ts

Contains unit definitions, aliases, and conversion functions between different units (imperial ↔ metric).

### wordsToNumber.ts

Parses spelled-out numbers into their numeric form (e.g., "eighty-five" → 85).

### levenshtein.ts

Provides fuzzy string matching capabilities using Levenshtein distance algorithm.

## Testing

CI fails when the tests cover less than 100% of the lines, branches, functions or statements in
`src/`. Each module should have a corresponding test file in the `tests/` directory. When adding
new features or fixing bugs, please include tests that cover your changes.

Tests can be run with:

```bash
# Run all tests
pnpm test

# Run tests in watch mode during development
pnpm test:unit:watch

# Generate test coverage report
pnpm test:unit:coverage

# Run mutation testing
pnpm test:mutation
```

CI also runs mutation testing with Stryker on pull requests to `main` and on pushes to `main`.
Stryker makes small changes to the code in `src/`, such as flipping a condition or deleting a
statement, and runs the tests against each one. The mutation score is the percentage of these
changes that the tests catch. The job fails when the score is below the `break` threshold in
`stryker.config.json` (currently 98). The job output lists each change the tests missed. A
`Survived` entry means tests ran and still passed; a `NoCoverage` entry means no test runs that
code. Add tests that catch either kind.

This job runs Stryker in incremental mode. A pull request reuses each result from its own last
run, or from `main`'s, when the mutant's code and covering tests haven't changed. Stryker doesn't
check other code that the mutant depends on, also in the same file. So a pull request's score can
differ from a full run. A change to the packages, or to a file that tests read, starts a full run.
Such files are `README.md`, `PARSING.md` and the corpus.

A push to `main` starts from no results and runs every mutant, except as the next paragraph says.
It saves the results that pull requests reuse. A re-run of the job also runs every mutant. For a
full run on a pull request, re-run this job or all jobs. "Re-run failed jobs" doesn't run this job
again when it passed.

A run that takes more than 27 minutes stops and fails, but it saves its results so far. On a pull
request, the next push goes on from them. On `main`, each push looks at the newest results that a
run on `main` saved. If that run stopped, the push goes on from its results and runs the mutants
that it didn't reach. These results come from an earlier commit, and a change to a file that tests
read doesn't reset them. So they aren't exact, and a run that goes on from them doesn't save its
results for pull requests. When runs on `main` overlap, the newest results can come from an older
commit than the last run that ended.

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
2. Decide `expected` before you run the parser. Use what the writer meant. Follow the README and
   `PARSING.md` when they cover the input. If they leave the choice between a value and `null`
   open, accept both.
3. Write exact values. Don't round them. Use 1 lb = 0.45359237 kg, 1 in = 2.54 cm and 1 ft = 12 in.
4. Don't add an input if its correct output depends on an open ticket. The ticket that your pull
   request fixes is the exception.
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

A pull request with the `fix` type that changes the parser's code adds at least one new entry built
from the ticket's failure inputs. The parser is each file under `src/` other than `src/index.ts`
and `src/types.ts`, and a change to only comments or formatting doesn't count. An edited entry
isn't a new one. Its `source` is the ticket ID on the PR's `Fixes` or `Part of` line, or, without a
Linear ticket, the URL of the issue. The "Regression test fails without the fix" check
fails without one. So each fixed bug stays in the score, and a later change can't bring it back
without a change to the snapshot.

### Property tests

`tests/properties.test.ts` makes each measurement first, for example 5 ft and 11 in. It writes the
measurement in each form that the README or `PARSING.md` shows, such as `5'11"`, `5-foot-11` and
`five feet eleven inches`. Then it checks that `parseMeasurement` gives the measurement back. So the
expected value is a hand calculation from the generated parts, as pull request rule 10 in
`AGENTS.md` asks. `tests/invariants.test.ts` checks a rule for every input: no throw, and a
positive value in a unit of the result's type.

A property that fails prints the smallest input that fails. Check that input against the README,
`PARSING.md` and the existing tests before you change the code or the property. A property must
not cover an input that an existing test reads in a different way.

`tests/measurementModel.ts` supplies the independent unit definitions and writers used by these
properties. Generate a quantity first, then write its text; calculate the expected result from
that quantity, never from the parser, its tokenizer or its conversion functions. Keep this model
small: it writes bounded integer phrases and supported unit placements, not arbitrary prose.
Comments beside each property identify the contract for its domain. For example, bare prefix
`in` and `m` need labels, and the multiplier after "and a half" is tested before the unit, since
the forward-read contract differs. Exact agreement boundaries use integers and binary fractions;
conversion assertions allow only rounding error from a few arithmetic operations.

The original properties use seed `20261017` and 1000 runs (50 in Stryker workers). The added
semantic combinations use seed `20261104` and 250 runs (25 in workers), with separate tests for
important boundaries and syntax choices. Run `pnpm test:unit tests/properties.test.ts`, then
`pnpm build && pnpm test:package tests/properties.test.ts` to check source, ESM and CJS. To replay
a failure, run its test with `-t 'test name'` and temporarily set its `fc.assert` options to the
reported `seed` and `path`. Keep the shrunk input and check its expected meaning independently.
Report a genuine existing bug under `AGENTS.md`; don't filter it out or adopt its wrong output.

For historical sensitivity checks, extract a fixing revision's `src/` and its parent's `src/`
with `git archive` into temporary directories. Use a temporary Vitest config with an alias from
`/^\.\.\/src$/` to each directory's `src/index.ts`, then run the same property by name. Record the
revision, command, seed and small counterexample, and confirm failure before the fix and success
after it. Some later contracts don't apply to old revisions; isolate the relevant property or
use an isolated deliberate defect instead. Historical sources and network access are not needed
for normal tests.

### PR workflow models

`tests/prReview.model.test.ts` checks review obligations after every event against the small
ledger in `tests/reviewModel.ts`. The ledger uses typed answer targets, reviewer identities and
logical time; a separate adapter writes GitHub snapshots and links. It does not parse comments
or call production helpers for expected results. Thread replies, review-body answers and Claude
summary answers have separate obligations. Late reviews use submission time for change requests
and commit identity for head completion, as the existing policy requires.

`tests/prPolling.model.test.ts` drives the CLI's extracted polling loop and real API error
classification with fake fetch and time. Its independent transition model checks each API call,
wait and terminal result, including the last result at timeout and the five-consecutive-error
budget. It preserves the current final poll on the deadline; a retry scheduled after it cannot
start. The real CLI fixture tests remain in `tests/prStatus.test.ts`.

Run `pnpm test:unit tests/prReview.model.test.ts tests/prPolling.model.test.ts`. Each generated
suite uses 200 runs, with seeds `199202611` (reviews) and `199202612` (polling). Review tails have
1–50 events; polling schedules have 1–20 responses, bounded further by their fake deadlines.
Assertions count executed command families and multi-event runs, including real edits and
deletions. On failure, fast-check reports a reduced sequence, seed and path. Replay with the
test name (`-t`) and those `fc.assert` options, as for the parser properties above.

Stryker mutates `src/`, so its score does not establish sensitivity of these tooling tests.
For that, copy `pr-state.mjs` and `pr-poll.mjs` into a temporary directory and use a temporary
Vitest alias to redirect the two test imports there. First run unchanged copies. Then make one
isolated defect at a time, for example remove the specific-link check in `answered`, or replace
the polling deadline's `ending(error)` with `throw error` to lose the last successful result.
Run the same model tests and record the edit, command, seed, reduced sequence and failure before
restoring the unchanged copies and confirming success. Do not modify fixtures, weaken assertions
or require historical checkouts or network access in ordinary CI.

### Tests against the package

`pnpm test:package` runs the tests of results against the built package, once through `import` and
once through `require` (`vitest.package.config.ts`). An alias gives the tests the package in place
of `src/`. Run `pnpm build` first. In CI, the `package` job runs them against the packed tarball,
installed in an empty project.

### Exported types

`api-report.d.ts` holds the types that the package exports, from the build, without comments.
`pnpm check:api` fails when the build's types differ from it. A change to an exported type needs
the maintainer's approval. When the ticket has it, run `pnpm check:api --update` and commit the
report.

### Evidence and risk

On each pull request, `.github/workflows/evidence.yml` writes a summary on the run's page. It lists
each result that changes in `tests/__snapshots__/resultSnapshot.txt` and each corpus entry whose
outcome changes. It also lists the changed examples in the README and `PARSING.md`, a change to
`api-report.d.ts`, and the bundle sizes before and after. When results change, the check fails until
the PR body has a "Changed results" line, list item or heading under "Description". Text must
follow it on the same line, or a list must follow it. A corpus entry that the PR edits doesn't
count as a changed result, because the edit, not the parser, can change its outcome.

The summary also rates the risk as low, medium or high, for the maintainer's review. No label or
merge rule uses the rating. A high risk is a change that the maintainer decides on:

- an example in the README or `PARSING.md`: a line of a code block that calls `parseMeasurement`,
  or a paragraph with a code span
- an exported type, or a `package.json` field that reaches users
- an expected output of a corpus entry, or a removed entry
- a lower test limit, a deleted test, or a test file renamed so that Vitest doesn't run it
- the test settings: `stryker.config.json`, the Vitest, ESLint, commitlint and TypeScript configs,
  and the `package.json` scripts
- a size budget that rises by more than 0.5 kB, or that the PR removes
- CI: a workflow, the setup action, or a script that a workflow runs

A medium risk changes code that runs or a result, or removes `expect` calls from the tests. A
comment that turns off a mutation or coverage check, such as `// Stryker disable`, is also a
medium risk. A low risk changes none of these. The script from the base branch rates the PR, so a
change to the script doesn't rate its own PR.

### Feature map

`features/` has one file for each feature, with each way that a user reaches it, the rules that
apply and the tests that check it. `features/README.md` says how to use it.
`tests/featureMap.test.ts` fails when a parser test file, a corpus category or a `PARSING.md`
section isn't in the map.

## Documentation

Add JSDoc comments to all public functions and types:

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

## Performance Considerations

This library is designed to be lightweight and performant. When contributing, keep in mind:

1. **Bundle Size**: Avoid adding dependencies when possible. Each build, `dist/index.js` and
   `dist/index.cjs`, has a budget of 5 kB after minifying and compressing with Brotli. The
   limits are set in `.size-limit.cjs`, and if this note disagrees with that file, the file is
   right. CI fails when a build goes over its budget. To check, run `pnpm build` and then
   `pnpm check:size`. To see how much minified code each source file adds, run
   `pnpm exec tsup --metafile` and load `dist/metafile-esm.json` into
   [esbuild's bundle analyzer](https://esbuild.github.io/analyze/). `pnpm check:size:why` can't
   show this, because it only sees the built file. Raise the budget only on its own ticket. The
   one exception is a fix whose smallest version goes over the budget: `AGENTS.md` ("Build the
   PR") allows a raise of 0.5 kB in that PR.
2. **Algorithmic Complexity**: Be mindful of performance in parsing algorithms.
3. **Memory Usage**: Avoid unnecessary object creation in hot paths.

## Any contributions you make will be under the MIT Software License

In short, all your submissions to fluent-measures will be under the same [MIT License](LICENSE) that covers the project.
