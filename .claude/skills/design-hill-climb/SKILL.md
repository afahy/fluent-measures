---
name: design-hill-climb
description: Improve the design of the docs page in rounds. AI judges from different model families score the page, an implementer fixes only that round's blockers, and the loop repeats until every judge gives the target score. Use only when the maintainer asks for a design hill-climb, or asks to iterate on the docs page's design with judges.
---

# Design hill-climb

<!-- cspell:ignore mktemp -->

Each round has two halves. Judges score the page and name what blocks the target score. Then an
implementer fixes those blockers, and nothing else. Only a fresh blind panel can accept the
page. The loop also stops when scores stop moving or the round budget runs out.

`AGENTS.md` gives the rules for the ticket and the PR. This file adds only the loop.

## Arguments

| Argument     | Default                                                                       |
| ------------ | ----------------------------------------------------------------------------- |
| Target path  | `docs/index.html`                                                             |
| Target score | 9                                                                             |
| Judge models | One Claude model and one GPT model: the most capable of each that you can run |
| Judge mode   | `full`: the whole panel each round; `staged` is optional                      |
| Round budget | 6 judging rounds, including blind acceptance                                  |

Use the defaults for each argument that the maintainer doesn't give. Calibration does not count
against the round budget. Each feedback or blind assessment counts as one round, regardless of
how many judges run. Reserve the last available round for blind acceptance; budget exhaustion
is never acceptance.

In `staged` mode, run the full panel in round 1, then one fixed judge for intermediate feedback.
Choose that judge at setup from the panel, using the maintainer's preference or available cost
and latency information. Record the choice; do not switch to whichever judge scores highest.
Both modes use the full panel for blind acceptance. Staged design judging never reduces the
fresh first-use reviewers required by the usability skill.

## Why the loop works this way

The docs redesign in AFA-185 took 13 judging rounds and about 40 agent runs. Each rule below
comes from a cost in that run:

- Eleven rounds were built on a stale local `main`, so the design had to be ported before it
  could merge. Work only from `origin/main`.
- A rubric where 9 meant "nothing left to improve", with a list of problems that judges had to
  fill, held both judges at 8 for nine rounds. Use the shared `rubric.md`, and
  calibrate it.
- New feedback judges with no history reversed earlier decisions. Give them the score history
  and decisions log. Blind acceptance judges get product constraints only, so earlier scores
  cannot anchor the final assessment.
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

9. Start `<run>/findings.md` using [the findings ledger](../council/ledger.md). Give each
   finding a stable ID, and include that ID in blocker lists and changelogs.
10. Prepare `<run>/constraints.md` with product requirements and scope limits only. Translate
    settled decisions into factual constraints; omit their round, score, reviewer, rationale
    about reaching a score, and change history. Keep feedback history in the coordinator's files.

## 2. Gates

Run these in the worktree before each judging round. Judges then spend their time on the design,
not on overflow bugs. Each gate must pass. If one fails before round `<n>`:

1. Fix the page, and commit the fix on its own, as `docs: fix the <gate> gate before round <n>`.
2. Add a line about the fix to `<run>/round-<n-1>/changelog.md` for feedback judges only.
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
results to its table. Resolve rubric problems before judging the page, then freeze the rubric,
model choices and target for the run. Do not change the rubric to raise a candidate's score.

Capture the two reference sites selected in `calibration.md` once for this run, with
`pnpm docs:shot`: 1440px and 390px, light and dark, using matching normal viewport heights for
the candidate. Capture representative sections as well as the top. Keep those images in
`<run>/references/` and list their absolute paths, site URLs, capture date, dimensions and
sections in `<run>/references.md`, without scores or labels such as "high polish". Use these
same images in every blind assessment; do not replace them between rounds. If a reference
cannot be captured, choose and record its replacement before the first round.

## 4. Judge

These are feedback rounds. Use section 8a for blind acceptance. Freeze the page while either
kind of panel runs. In staged mode, select only the fixed intermediate judge after round 1.
If only one budgeted round remains, use section 8a instead, including after a failed blind
assessment and its fix. A one-round budget therefore permits only a blind assessment.

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
     CHANGELOG=@<run>/round-<n-1>/changelog.md DECISIONS=@<run>/decisions.md \
     RUBRIC=@.claude/skills/design-hill-climb/rubric.md
   ```

   The script stops if a value is missing or empty, if a file isn't there, or if a value doesn't
   match a placeholder.

3. Start one new subagent for each selected judge model, all at the same time. Give each one the text of
   its `brief.md` as its whole prompt, and nothing else, so that the judges don't share your
   assumptions. For a model from another provider, use the session's tool for that provider, for
   example T3 Code's `delegate_task`. If no tool can run a model family, tell the maintainer, and
   ask whether to go on with fewer families. Don't put a second model of the same family in its
   place.
4. Read each reply and each `review.md`. Take the scores from the `SCORES:` line. If a reply has
   no such line, start that judge again once with the same brief. If the line is still missing,
   take the scores from its table, and say so in the report. If neither has scores, record
   `no score`; a missing or failed review cannot pass.
5. Add the round to `<run>/history.md`. It is a table of Overall scores, with a row for each
   round and a column for each judge model. In round 1, replace the file's one line with the
   table. Label each row `feedback` or `blind acceptance`, and record the page commit. Write
   `not run` for an unselected judge, never a carried-forward score. Under the table, keep the
   sub-scores of the last round only. Missing scores are not evidence of improvement or decline.
   For each existing finding, record whether the page resolves it, with evidence, in the ledger.
6. Apply the stop rules in section 8 now. Go on to section 5 only if none of them applies, so
   that no round adds a change after the judges pass the page.

## 5. Decide

Write the round's blockers to `<run>/round-<n>/blockers.md`, as a numbered list. For each blocker,
give its stable finding ID, location, problem, fix, and which judges named it.

- A blocker that each judge named comes first. Two blockers are the same when they name the same
  problem in the same place, even in other words.
- In a full panel, add a blocker that only one judge named only when its fix is small, stays in
  one place, and can't change a result or break a test. In a staged feedback round, validate the
  sole judge's blocker against the page and constraints yourself; agreement by absent judges
  cannot be assumed. Keep at most 3 blockers.
- Drop each blocker that reverses an entry in `decisions.md`, unless the entry's execution is
  broken.
- Leave out each nit. List the nits in the round's report, but never give them to the
  implementer.
- When the judges disagree, settle it as `AGENTS.md` "Make your own decisions" says. Add the
  choice to `decisions.md` as `- Round <n>: <decision>. Why: <the disagreement and the reason>.`
- Compare scores only for the same judge and assessment kind. When its Overall score went down,
  read why. If the last round's change caused it, don't
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

- **After judging:** name the mode and assessment kind, with each judge's scores and comparable changes,
  the blockers that you chose, the ones that you dropped and why, the nits, and each new
  decision.
- **After implementing:** before and after screenshots. Take them with `pnpm docs:shot` at 1440px
  and 390px, in light and in dark, of `<run>/round-<n-1>/after/` and `<run>/round-<n>/after/`.
  Save them in `<run>/round-<n>/shots/`, and show them in the report.

## 8. Stop rules

Apply these after each feedback or blind round, in this order:

Before moving to another assessment without an implementation or revert, copy the current
target folder to `<run>/round-<n>/after/` and write `No page changes.` to that round's changelog.
This keeps snapshots and changelogs complete when feedback leads straight to acceptance.

1. **Pass:** only a blind acceptance round can pass, as section 8a says. Go to section 9.
2. **Budget:** if no round remains, report the unresolved findings and ask the maintainer
   whether to continue. Do not implement another round or treat the budget as approval.
3. **Candidate:** after feedback, if all judges who ran reached the target, only nits remain,
   or just one budgeted round remains, run section 8a next without another implementation.
   A sole judge's score only triggers that assessment; it never accepts the page.
4. **Plateau:** after three comparable feedback rounds, if no participating judge improved in
   either of the last two comparisons, ask the maintainer whether to continue. In staged mode,
   compare only the fixed judge's feedback scores. Exclude blind rounds and missing scores.
5. **Incomplete acceptance:** if a blind round did not pass and has no actionable finding,
   keep the page unchanged and run another fresh blind assessment within the remaining budget.
   This includes a missing review or scores below the target with only nits. Never start an
   empty implementation round. The budget rule still stops repeated failed assessments.
6. Otherwise continue at section 5 with the current findings. A blind failure supplies findings
   for the next fix; it does not start a new budget. Nits alone never justify a fix round.

## 8a. Blind acceptance

Use this for final design acceptance, including after usability changes or a merge from main.
It is one full-panel round within the calling run's budget.

1. Run the gates. Freeze the candidate and record its commit. Make fresh scratch folders for
   every judge in the panel, even in staged mode. Use new agents with no inherited conversation.
2. Fill `acceptance-brief.md` with `fill.mjs`. Supply only `REPO`, `PAGE_URL`, `SCRATCH`,
   `ABOUT=@<run>/about.md`, `PAGE_SOURCE=@<run>/page-source.md`,
   `CONTENT_SPEC=@<run>/content-spec.md`, `CONSTRAINTS=@<run>/constraints.md`,
   `REFERENCES=@<run>/references.md` and `RUBRIC=@.claude/skills/design-hill-climb/rubric.md`.
   Inspect the filled briefs: no requested score, previous score, round, finding ledger,
   changelog, calibration result, earlier review or PR/ticket discussion may appear. Do not
   send `decisions.md` as constraints without removing that history. The shared scoring scale
   is allowed; it must not say which score the coordinator wants.
3. Start the full panel as section 4 says, with only each filled brief. An unavailable family
   or failed review is not a pass; follow section 4's availability and missing-score rules.
4. After the reviews return, apply the requested threshold yourself. Every panel member must
   score the current candidate at or above the target. All mandatory gates must pass, with no
   unresolved candidate gate failure discovered by the judges. Do not average scores or carry one from
   an earlier round. Record the scores, gate findings and candidate commit in the history.
5. If the brief or a judge's report shows exposure to forbidden history, discard that assessment
   and report it. A fresh replacement assessment consumes another budgeted round.
6. Record and judge findings as section 5 says, then apply section 8. If the candidate changes
   after acceptance, including for a gate repair or bot finding, run the gates and a new blind
   assessment before shipping. Ask for more rounds if none remain.

## 9. Ship

1. Run `git fetch origin`. If `origin/main` has commits that the branch doesn't, bring them in,
   so that the final scores apply to the code that merges:
   - Rebase the branch onto `origin/main` while nothing of it is pushed. If the branch is pushed,
     or has a PR, merge `origin/main` into it instead. Never force-push.
   - If `origin/main` changed the README, `PARSING.md` or the docs tests, make the page follow
     them again.
   - Run the gates and blind acceptance again within the remaining budget. If it fails, follow
     section 8; do not ship based on scores from before the merge.
2. Follow `AGENTS.md` "Build the PR", "Handle findings and CI" and "Finish the PR".
3. In the PR body, under "Description", add the score history from `<run>/history.md`, each
   `Round <n>` entry from `decisions.md`, the ledger outcomes, judge mode, reference manifest,
   blind acceptance commit, the calibration rows that this run added, and the nits
   of the last round that are left. The decisions in the PR body are the record that a later run
   starts from.
