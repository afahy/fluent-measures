---
name: find-failing-inputs
description: Look for parseMeasurement inputs that a branch gets wrong. Use in a new subagent for each PR that changes src/, with only the branch name and the ticket ID. It writes the expected result of each input before it runs it, runs the inputs through the corpus test on the branch and on main, and reports each input whose result disagrees with the README, PARSING.md or a hand calculation.
---

# Find failing inputs

<!-- cspell:ignore mktemp -->

Reviewers read the diff. This skill tests it: you write inputs that can break the change, and the
corpus test runs them. Each finding is then an input and two results, not an opinion.

You get only a branch name and a ticket ID. Don't read the PR body, its comments or other
reviews, so that you don't share their assumptions.

## 1. Find the features that the change touches

1. Read the ticket.
2. Run `git diff origin/main...<branch> -- src/`. Use the local branch, which can be ahead of its
   push, or not pushed yet.
3. Open each file in `features/` whose "Source" line names a changed file. Read its "How a user
   reaches it" and "Where the rules are" sections, and the README and `PARSING.md` sections that
   they name.

## 2. Write the inputs and their expected results

Write at least 20 inputs. Aim them at the changed lines:

- Each way to reach the feature that the feature file lists, and each option that changes it.
- The limits of each changed condition, for example 11 and 12 inches, 1% agreement, a unit name
  of three characters, or a comma group of two and of three digits.
- The same input in other forms: digits and words, a space and no space, marks and unit names.
- Text around the measurement, and words that are near a unit name.

For each input, decide the expected output before you run it. Take it from the README, from
`PARSING.md` or from a hand calculation. Use 1 lb = 0.45359237 kg, 1 in = 2.54 cm and
1 ft = 12 in. When the specification leaves the choice between a value and `null` open, accept
both. When it doesn't cover the input at all, leave the input out.

Write each input as a corpus line, as "Measurement corpus" in `CONTRIBUTING.md` says. Give each
one an `id` that starts with `probe-`, the category that fits, and `"source": "handwritten"`.
Write the lines in a file in your scratchpad.

## 3. Run the inputs on the branch and on main

Do this in worktrees of your own, never in the PR's worktree. Put each one in a new temporary
directory, so that two runs at the same time can't use the same path:

```bash
probe_branch="$(mktemp -d)/branch"
probe_main="$(mktemp -d)/main"
git worktree add --detach "$probe_branch" <branch>
git worktree add --detach "$probe_main" origin/main
```

In each worktree:

1. Run `pnpm install`.
2. Add your lines to the end of `tests/corpus/measurements.jsonl`.
3. Run `pnpm exec vitest run tests/corpus.test.ts -u`.
4. Read `tests/__snapshots__/corpus.test.ts.snap`. Each `probe-` entry that it lists under
   "wrong", "missed" or "throws" disagrees, with its actual output. An entry that it doesn't list
   agrees.

Then remove your two worktrees, and only those, with `git worktree remove --force "$probe_branch"`
and `git worktree remove --force "$probe_main"`.

## 4. Report

Report only these facts. Don't fix code, commit or post comments.

- Each `probe-` entry that disagrees on the branch: its corpus line, the actual output on the
  branch and on `main`, and the README or `PARSING.md` section, or the calculation, that gives
  the expected output.
- Mark each one **new** when it agrees on `main`, because the branch causes it. Mark it
  **on main** when it disagrees on both.
- The number of inputs that agree on the branch.

The agent that started you judges each finding as AGENTS.md "Handle findings and CI" says. It
adds each confirmed input to the corpus in the PR, with the outcome that it has there.
