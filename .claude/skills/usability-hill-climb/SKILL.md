---
name: usability-hill-climb
description: Improve first-use usability of the docs page in rounds. Fresh AI reviewers from two model families do real tasks with the page, a grader scores them against a hidden answer key, and an implementer fixes only the causes that the traces show. Use only when the maintainer asks for a usability hill-climb of the docs page.
---

# Usability hill-climb

<!-- cspell:ignore mktemp jsonl selfcheck -->

Fresh reviewers who have never seen the library do the tasks in `tasks.md` with the docs page.
`grade.mjs` scores each answer against a hidden answer key and counts wrong turns from the trace
that the viewer and the runner write. An implementer then fixes only the causes that the traces
show. The loop stops when a round passes, when a stop rule applies, or when the budget runs out.

`AGENTS.md` gives the rules for the ticket and the PR. `.claude/skills/design-hill-climb/SKILL.md`
gives the setup, the gates, `fill.mjs`, the implementer flow, a commit per round, the revert rule
and the Ship section. This file says only what changes.

## The answer key

The key is `answer-key.json`. It is **not in the repository**, because reviewers can read the
repository. The maintainer's copy is in
`/Users/afahy/Dev/fluent-measures-usability-kit/private/answer-key.json`. Copy it to
`<run>/private/answer-key.json` for each run. Never put it, or an expected answer, in the
repository, in a reviewer's folder, in `<run>/kit/` or in a brief. If the maintainer's copy is
missing, stop and ask for it.

Each expected value in the key comes from the README, `PARSING.md`, a maintainer decision or a
hand calculation, never from running the code. Each task has a `path` (the page sections that it
needs, as heading ids) and a `benchmarkViews`. Change them only in the pilot, and bump the key's
`version` when you do.

## Evidence

AI reviewers are simulated first-time users. They see the page as viewport text and
screenshots, they don't skim like people or get tired, and their times are agent wall-clock time.
Label every AI number "simulated AI reviewers". Keep human sessions (`human-sessions.md`) in
their own table, and never average the two. A pass from AI reviewers is necessary, not
sufficient. Recommend human sessions before anyone calls the page easy to use in public.

## Arguments

| Argument     | Default                                                                       |
| ------------ | ----------------------------------------------------------------------------- |
| Target path  | `docs/index.html`                                                             |
| Viewport     | 1440 × 900, light                                                             |
| Reviewers    | 4 a round: 2 model families × the 2 personas in `personas/`                   |
| Model family | One Claude model and one GPT model: the most capable of each that you can run |
| Round budget | 3 fix rounds after the baseline                                               |

## Files

| File                               | For         | What it is                                                            |
| ---------------------------------- | ----------- | --------------------------------------------------------------------- |
| `tasks.md`, `tasks-holdout.md`     | reviewers   | task cards and the `answers.json` format                              |
| `reviewer-brief.md`                | reviewers   | brief template, filled with the design skill's `fill.mjs`             |
| `personas/*.md`                    | reviewers   | skimmer and careful                                                   |
| `browse.mjs`                       | reviewers   | the only page viewer, writes `trace.jsonl`                            |
| `try.mjs`                          | reviewers   | runs code in the sandbox, logs failed runs                            |
| `setup.sh`                         | organizer   | packs the package, makes reviewer folders                             |
| `grade.mjs`                        | organizer   | `selfcheck`, `reviewer`, `round`                                      |
| `synthesis.md.tmpl`                | organizer   | findings, severity and blocker rules                                  |
| `implementer-brief.md`             | implementer | brief template for fix rounds                                         |
| `decisions.md.tmpl`                | all         | standing decisions that a run starts from                             |
| `human-sessions.md`                | moderator   | script and record for human sessions                                  |
| `answer-key.json` (outside a repo) | grader only | expected answers, grounding, paths, benchmarks (see "The answer key") |

## 1. Setup

1. Claim the ticket, fetch, and make the worktree from `origin/main` on the ticket's
   `gitBranchName`, as design skill section 1 says. Run `pnpm install`.
2. Make a run folder: `R=$(mktemp -d /tmp/fluent-usability-XXXXXX)`. Copy this folder, without
   `SKILL.md`, to `$R/kit/`, for the organizer. `setup.sh reviewer` copies only `browse.mjs` and
   `try.mjs` to `$R/reviewer-kit/`, which is each reviewer's `$KIT`, so that the files that the
   brief lets reviewers read hold no grader and no holdout tasks. The key and the kit are still on
   the same disk: rule 3 of the brief, and each reviewer's report on it, are what keep reviewers
   out. Copy the key to `$R/private/`. Copy `decisions.md.tmpl` to
   `$R/decisions.md`, and add the entries of the last usability run from its PR body.
3. Check the key against the merged README, `PARSING.md` and page. Each `path` id must be a
   heading id on the page, and each grounding note must still hold. If an id or a rule changed,
   update the key, bump its version, and say so in the PR.

## 2. Package and self-check

Run `sh $R/kit/setup.sh package <worktree> $R`. Reviewers test the package packed from the
commit that the page describes, so that the run measures the page and not an npm release. Make
one reviewer folder (section 6), and run
`node $R/kit/grade.mjs selfcheck --key $R/private/answer-key.json --sandbox <folder>/sandbox`.
If it fails, stop: the sandbox or the library disagrees with the key.

## 3. Gates

Run the gates of design skill section 2 on the worktree before each review round. Reviewers read
the worktree's `file://` page. When they pass before the baseline, copy `docs/` to
`$R/round-0/after/`.

## 4. Pilot

One Claude reviewer, skimmer persona, on the worktree page, in `$R/pilot/`. Read its trace,
answers and report. Fix only the tools, the task wording, `path` and `benchmarkViews`, then bump
the protocol version (the HTML comments in `tasks.md` and `reviewer-brief.md`) and the key's
version. Don't count the pilot's numbers.

## 5. Control

Copy `docs/` to `$R/control/docs/` and seed known defects in the copy, for example a renamed
option in a convert example, and a wrong result in the Limits table. Run one reviewer of each
family on it. The control passes when both reviewers show failures or wrong turns on the tasks
that the defects touch. If not, the method can't see problems: fix the protocol before the
baseline.

## 6. Review round

1. For each reviewer, from the worktree:

   ```bash
   HOLDOUT=1 sh $R/kit/setup.sh reviewer $R <n> <family>-<persona> \
     file://<worktree>/docs/index.html <worktree>
   ```

   Set `HOLDOUT=1` only in the baseline and the final round.

2. Fill `reviewer-brief.md` with `.claude/skills/design-hill-climb/fill.mjs`, with `PERSONA=@`
   the persona file, `DIR=` the reviewer folder, `PAGE_URL=` the page and
   `VIEW='1440 × 900, light'`, to `<reviewer folder>/../<id>-brief.md`, outside the reviewer's
   folder.
3. Start the 4 reviewers at the same time, each with the text of its brief as its whole prompt.
   Start Claude reviewers with the `Agent` tool and GPT reviewers with the session's tool for that
   provider. Never give a reviewer the score history, the decisions, the changelog, an earlier
   report or the key: a reviewer who knows what changed isn't a first-time user. If a model
   family can't run, stop and tell the maintainer. Don't put a second model of the same family in
   its place.
4. Save each reviewer's reply as `<folder>/report.md`. Claude subagents can't write report
   files, so the brief asks for the report in the reply. Grade each reviewer, then the round. The
   round command writes `metrics.md`:

   ```bash
   node $R/kit/grade.mjs reviewer --key $R/private/answer-key.json --dir <folder>
   node $R/kit/grade.mjs round --key $R/private/answer-key.json --round $R/round-<n>
   ```

5. Write `$R/round-<n>/synthesis.md` from `synthesis.md.tmpl`. Act only on findings that the
   trace or the grade backs. A finding without such evidence is an opinion. The wrong-turn count
   misses a run that exits 0 with a wrong value, so read each task's `runLog` in `grade.json`
   too. It also counts views that the viewer names after the wrong section (see "Limits"), so
   check each counted wrong turn against its note before you call it page-caused.

## Acceptance criteria

A round passes when all of these hold, over the core tasks of the 4 reviewers:

1. At least 90% of the attempts are correct, and each task is correct for at least 3 of 4.
2. No answer is confident-wrong (wrong with confidence 4 or 5).
3. The median wrong turns per attempt is 0, and no task's mean is above 1.
4. Each task's median views is at most 2 × its benchmark.
5. `synthesis.md` has no open S1 or S2 finding in page scope.

`grade.mjs round` checks 1 to 4. The organizer checks 5. The final round also needs:

6. The holdout correct share within 15 points of the core share.
7. One design-judge round of the design skill (`judge-brief.md`, both families) gives at least 9
   Overall from each judge. Give the judges the last design run's history and decisions, and a
   changelog of the usability changes.
8. The gates and `pnpm check` pass.

## 7. Stop rules

Apply these after each graded round, in this order:

1. **Pass:** criteria 1 to 5 hold. Go to the final round. If the baseline passes, report that the
   page needs no usability change for this task set, and run no fix round.
2. **Regression:** a fix round lowered the correct count of a task whose section it changed, or
   added an S1 there. `git revert` the round's commit, add a decision, and go on with the next
   round from the reverted page.
3. **Scope:** each remaining S1 or S2 needs a README or `PARSING.md` example change, an exported
   type change, a parser change or a release. File it or ask on the ticket as AGENTS.md "Stop and
   ask" says, and stop the loop.
4. **Plateau:** after 2 fix rounds, the last round improved neither the correct count nor the
   total page-caused wrong turns. Ask the maintainer.
5. **Budget:** the round budget is spent. Ask the maintainer.

## 8. Fix round

For round `n`, from 1:

1. Write `$R/round-<n>/blockers.md` with the blocker rules of `synthesis.md.tmpl`: at most 3,
   each with its location, problem, trace evidence, fix and reviewers.
2. Fill `implementer-brief.md` with `fill.mjs`: `ROUND`, `TARGET`, `REPO`,
   `BLOCKERS=@$R/round-<n>/blockers.md`, `DECISIONS=@$R/decisions.md`,
   `SNAPSHOT=$R/round-<n>/after`, `SCRATCH=$R/round-<n>/implementer`. Start one new subagent
   with it.
3. Read `git diff`, undo each change that no blocker asked for, and run the gates yourself.
   Snapshot `docs/` to `$R/round-<n>/after/` again if you changed it.
4. Commit `docs: usability hill-climb round <n>`. A commit for each round lets you revert one.
5. Run section 6 with 4 new reviewers, without the holdout tasks.

## 9. Report

Send the maintainer a short report after each graded round and after each fix: the metrics
table, the blockers chosen and dropped with their evidence, the decisions, the tickets filed, and
what waits on the maintainer. Put each report in the same message as your next tool call.

## 10. Final round and ship

1. After a pass, run section 6 with 4 new reviewers and `HOLDOUT=1`, and the design-judge round.
2. Ship as design skill section 9 says. In the PR body, under "Description", add each round's
   `metrics.md`, the findings table, the decisions, the holdout check and the design-judge
   scores, with "simulated AI reviewers" beside every AI number. Say whether human sessions ran.

## Limits

- Four reviewers a round is a small sample. The blocker rules act only on an S1, or on a
  problem that two reviewers hit.
- The viewer names a view's section from the last heading in the top third of the viewport, so
  a view across two sections counts as the last heading in that third. A view at `#usage` is
  named `ex-basic`, because that heading follows at once, so a path that has `usage` also needs
  `ex-basic`. In the same way, a view at `#api` is named `parse-measurement`, and a Find match near
  the top of a section is often named after the section above it.
- The viewer reloads the page on each call, so a reviewer repeats `--click` to open a panel.
- The trace shows what a reviewer looked at, not what it read. The `misled` and `--note` text
  fill that gap, and they are self-report.
