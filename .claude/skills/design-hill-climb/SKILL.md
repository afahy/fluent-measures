---
name: design-hill-climb
description: Improve the design of the docs page in rounds. AI judges from different model families score the page, an implementer fixes only that round's blockers, and the loop repeats until every judge gives the target score. Use only when the maintainer asks for a design hill-climb, or asks to iterate on the docs page's design with judges.
---

# Design hill-climb

<!-- cspell:ignore mktemp -->

Each round has two halves. Judges score the page and name what blocks the target score. Then an
implementer fixes those blockers, and nothing else. The loop stops when every judge gives the
target score, when the scores stop moving, or when the round budget runs out.

`AGENTS.md` gives the rules for the ticket and the PR. This file adds only the loop.

## Arguments

| Argument     | Default                                                                       |
| ------------ | ----------------------------------------------------------------------------- |
| Target path  | `docs/index.html`                                                             |
| Target score | 9                                                                             |
| Judge models | One Claude model and one GPT model: the most capable of each that you can run |
| Round budget | 6 judging rounds                                                              |

Use the defaults for each argument that the maintainer doesn't give.

## Why the loop works this way

The docs redesign in AFA-185 took 13 judging rounds and about 40 agent runs. Each rule below
comes from a cost in that run:

- Eleven rounds were built on a stale local `main`, so the design had to be ported before it
  could merge. Work only from `origin/main`.
- A rubric where 9 meant "nothing left to improve", with a list of problems that judges had to
  fill, held both judges at 8 for nine rounds. Use the v2 rubric in `judge-brief.md`, and
  calibrate it.
- New judges with no history reversed earlier decisions. Give each judge the score history and
  the decisions log.
- Implementers that fixed every item added features and caused regressions. Give each
  implementer only the round's blockers.
- Briefs built by hand, and twice by a broken generator, came out wrong. Fill each brief with
  `fill.mjs`.
- Headless Chrome's `--window-size` can't go below about 500px, so its phone screenshots were
  wrong. Use `pnpm docs:shot`.

## 1. Setup

1. Find the Linear ticket for the work. If there is none, file one in the current milestone, with
   the target path and the target score in its "Done when" list. Claim it as `AGENTS.md` "Build
   the PR" says.
2. Run `git fetch origin`. Run `git rev-list --count main..origin/main`, and say in your first
   report how many commits local `main` is behind `origin/main`. Never build on local `main`.
3. Make a worktree for the ticket's branch from `origin/main`. Use the ticket's `gitBranchName`
   as the branch name. If a branch or an open PR already names the ticket, continue on that
   branch. Run `pnpm install` in the worktree. If `pnpm` isn't on PATH, `CONTRIBUTING.md` says
   how the git hooks find it. Never use `--no-verify`.
4. If `pnpm docs:shot` or `pnpm docs:sweep` doesn't exist in the worktree, stop and tell the
   maintainer. AFA-186 adds them.
5. Make a run folder outside the worktree with `mktemp -d`. Write down the path that it prints,
   and use it in place of `<run>` below. Each round `<n>` gets a folder `<run>/round-<n>/`.
6. Copy `decisions.md.tmpl` to `<run>/decisions.md`. To carry decisions over from an earlier
   run on the same page, copy that run's entries from its PR body into the file.
7. Write `<run>/history.md` and `<run>/round-0/changelog.md`, each with one line:
   `None. This is the first round.`
8. Write these three files. They are the same in each round. Put the worktree's path in place of
   `<worktree>`, because `fill.mjs` copies each value as it is. For a target path other than
   `docs/index.html`, change the text to fit.
   - `<run>/about.md`: `The GitHub Pages site of the open-source TypeScript library @afahy/fluent-measures, which parses height and weight strings such as 5' 11" or 150 lbs into structured data.`
   - `<run>/page-source.md`: `The page is <worktree>/docs/index.html. It also uses the other files in <worktree>/docs/.`
   - `<run>/content-spec.md`: `<worktree>/README.md is the public spec for content, and <worktree>/PARSING.md holds the detailed parsing rules. The page links to PARSING.md. The page must follow them, even where you would word an example differently.`

## 2. Gates

Run these in the worktree before each judging round. Judges then spend their time on the design,
not on overflow bugs. Each gate must pass. If one fails before round `<n>`:

1. Fix the page, and commit the fix on its own, as `docs: fix the <gate> gate before round <n>`.
2. Add a line about the fix to `<run>/round-<n-1>/changelog.md`, which this round's judges read.
3. Copy the folder of the target path again, with each file in it, to `<run>/round-<n-1>/after/`.

4. `pnpm lint`.
5. The docs tests: `pnpm exec vitest run tests/docsPage.test.ts tests/docsExamples.test.ts`.
6. `pnpm docs:sweep`. It loads the page at each width from 320 to 1600px, and exits with an error
   when it finds overflow, clipped content or missing navigation.
7. The accessibility check. Read the HTML and CSS, look at the screenshots, and confirm each of
   these in light and in dark:
   - Text has a contrast of at least 4.5:1 with its background, and large text and controls at
     least 3:1. Compute the ratios from the colors. Check each code token on each code surface.
   - Each link, button, tab and menu has a visible `:focus-visible` style.
   - The keyboard reaches each control in the order of the layout, and tabs and menus work with
     the arrow keys, Enter and Escape as their ARIA roles say.
   - The page has one `h1`, and no heading level is skipped.
   - Each image has `alt` text, and each icon that carries meaning has an accessible name.
   - Links in prose are underlined.
   - Motion stops under `prefers-reduced-motion`.
   - With JavaScript off, the content, the navigation and dark mode still work.

Before round 1, when the gates pass, copy the folder of the target path, with each file in it, to
`<run>/round-0/after/`. This is the "before" of round 1.

## 3. Calibration

Before the first judging round, read `calibration.md`. Calibrate if it says to, and add the
results to its table. If the results say that a judge can't reach the target, fix the rubric
before you judge the page.

## 4. Judge

1. Make a scratch folder for each judge model: `<run>/round-<n>/judge-<model>/`.
2. Fill `judge-brief.md` for each judge with `fill.mjs`. Run it from the worktree, with one
   `NAME=value` or `NAME=@file` for each placeholder:

   ```bash
   node .claude/skills/design-hill-climb/fill.mjs \
     .claude/skills/design-hill-climb/judge-brief.md <run>/round-<n>/judge-<model>/brief.md \
     ROUND=<n> TARGET_SCORE=<score> REPO=<worktree> \
     PAGE_URL=file://<worktree>/<target path> SCRATCH=<run>/round-<n>/judge-<model> \
     ABOUT=@<run>/about.md PAGE_SOURCE=@<run>/page-source.md \
     CONTENT_SPEC=@<run>/content-spec.md HISTORY=@<run>/history.md \
     CHANGELOG=@<run>/round-<n-1>/changelog.md DECISIONS=@<run>/decisions.md
   ```

   The script stops if a value is missing or empty, if a file isn't there, or if a value doesn't
   match a placeholder.

3. Start one new subagent for each judge model, all at the same time. Give each one the text of
   its `brief.md` as its whole prompt, and nothing else, so that the judges don't share your
   assumptions. For a model from another provider, use the session's tool for that provider, for
   example T3 Code's `delegate_task`. If no tool can run a model family, tell the maintainer, and
   ask whether to go on with fewer families. Don't put a second model of the same family in its
   place.
4. Read each reply and each `review.md`. Take the scores from the `SCORES:` line. If a reply has
   no such line, start that judge again once with the same brief. If the line is still missing,
   take the scores from its table, and say so in the report.
5. Add the round to `<run>/history.md`. It is a table of Overall scores, with a row for each
   round and a column for each judge model. In round 1, replace the file's one line with the
   table. Under the table, keep the sub-scores of the last round only.
6. Apply the stop rules in section 8 now. Go on to section 5 only if none of them applies, so
   that no round adds a change after the judges pass the page.

## 5. Decide

Write the round's blockers to `<run>/round-<n>/blockers.md`, as a numbered list. For each blocker,
give its location, the problem, the fix, and which judges named it.

- A blocker that each judge named comes first. Two blockers are the same when they name the same
  problem in the same place, even in other words.
- Add a blocker that only one judge named only when its fix is small, stays in one place, and
  can't change a result or break a test. Keep the list short.
- Drop each blocker that reverses an entry in `decisions.md`, unless the entry's execution is
  broken.
- Leave out each nit. List the nits in the round's report, but never give them to the
  implementer.
- When the judges disagree, settle it as `AGENTS.md` "Make your own decisions" says. Add the
  choice to `decisions.md` as `- Round <n>: <decision>. Why: <the disagreement and the reason>.`
- When a judge's Overall score went down, read why. If the last round's change caused it, don't
  implement this round. Revert the last round's commit with `git revert`, and add a decision that
  says what not to do again. Write `<run>/round-<n>/changelog.md` with one line that says which
  round you reverted and why. Copy the folder of the target path to `<run>/round-<n>/after/`.
  Then start round `<n+1>` at section 2. This round's blockers were written about the page before
  the revert, so don't use them.

## 6. Implement

1. Fill `implementer-brief.md` with `fill.mjs` in the same way, to
   `<run>/round-<n>/implementer-brief.md`. Use `ROUND`, `TARGET=<target path>`, `TARGET_SCORE`,
   `REPO`, `BLOCKERS=@<run>/round-<n>/blockers.md`, `DECISIONS=@<run>/decisions.md`,
   `SNAPSHOT=<run>/round-<n>/after` and `SCRATCH=<run>/round-<n>/implementer`.
2. Start one new subagent with the text of the brief as its whole prompt.
3. When it reports, read `git diff` in the worktree. Undo each change that no blocker asked for.
4. Run the gates in section 2 again yourself. Don't take the implementer's word for them.
5. If you changed a file in step 3 or 4, copy the folder of the target path again, with each
   file in it, to `<run>/round-<n>/after/`, so that the snapshot shows what you commit.
6. Write `<run>/round-<n>/changelog.md`: one line for each blocker, saying what changed on the
   page. The next round's judges read it.
7. Commit the round in the worktree, as `docs: design hill-climb round <n>`. A commit for each
   round lets you revert one round on its own.

## 7. Report each round

Send the maintainer two short reports in each round. Don't wait for an answer after either one.
Put each report in the same message as your next tool call, and go on with the loop.

- **After judging:** one paragraph with each judge's scores and the change since the last round,
  the blockers that you chose, the ones that you dropped and why, the nits, and each new
  decision.
- **After implementing:** before and after screenshots. Take them with `pnpm docs:shot` at 1440px
  and 390px, in light and in dark, of `<run>/round-<n-1>/after/` and `<run>/round-<n>/after/`.
  Save them in `<run>/round-<n>/shots/`, and show them in the report.

## 8. Stop rules

Apply these after each judging round, in this order:

1. **Pass:** each judge's Overall score is at least the target score. Go to section 9.
2. **Plateau:** after at least 3 judging rounds, no judge's Overall score went up in either of
   the last 2 rounds, compared with the round before each. Read `calibration.md` again, and
   calibrate again if the rubric or a judge model changed. Then ask the maintainer whether to go
   on, with the scores and the blockers that are left.
3. **Budget:** the run has had as many judging rounds as the round budget. Ask the maintainer
   whether to go on, in the same way.

To ask, end your turn with the question. Apart from these two rules, the loop waits for the
maintainer only when sections 1 and 4 say to stop.

## 9. Ship

1. Run `git fetch origin`. If `origin/main` has commits that the branch doesn't, bring them in,
   so that the final scores apply to the code that merges:
   - Rebase the branch onto `origin/main` while nothing of it is pushed. If the branch is pushed,
     or has a PR, merge `origin/main` into it instead. Never force-push.
   - If `origin/main` changed the README, `PARSING.md` or the docs tests, make the page follow
     them again.
   - Run the gates, and do one more judging round. If it doesn't pass, go back to section 5.
2. Follow `AGENTS.md` "Build the PR", "Handle findings and CI" and "Finish the PR".
3. In the PR body, under "Description", add the score history from `<run>/history.md`, each
   `Round <n>` entry from `decisions.md`, the calibration rows that this run added, and the nits
   of the last round that are left. The decisions in the PR body are the record that a later run
   starts from.
