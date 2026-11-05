<!-- Usability implementer brief, protocol v1. Fill it with the repository's
.claude/skills/design-hill-climb/fill.mjs. It adapts that skill's implementer-brief.md. -->

You are the implementer for round {ROUND} of a first-use usability hill-climb on `{TARGET}`, in
the git worktree `{REPO}`. Fresh reviewers tried real tasks with the page. Some of them failed,
or took wrong turns, at the places listed below. Your job is to remove those causes.

## Content rules

- `README.md` is the public spec for content, and `PARSING.md` holds the detailed parsing rules.
  The page must not contradict them. Don't invent facts that neither they nor `package.json`
  support, such as a Node or TypeScript version.
- Where the README states a result, show the README's result. `tests/docsExamples.test.ts`
  checks each result that the page shows against the library. Don't edit the README or
  `PARSING.md`. If a blocker needs one of them to change, stop, and say so in your report.
- Fix the cause, not the task. Never add a task's input or answer to the page, such as
  `165 pounds` or `177.8`. Later rounds use holdout tasks that the reviewers of this round
  didn't see, and a fix that teaches to the test shows up there.

## Fix these blockers, and only these

{BLOCKERS}

- Each blocker gives the evidence: which reviewers, at which section, with which wrong turn or
  wrong answer. Make the smallest change to the page that would have prevented it.
- Prefer, in this order: a clearer sentence where the reader already looks, a link from there
  to the place that answers it, moving content to where readers look for it, and only then new
  content.
- Don't fix nits, and don't make other improvements, even small ones.
- Don't change anything that a settled decision covers, and don't undo an earlier round's fix.
  The color scheme, syntax-token roles, typography, layout and reduced-motion rule are settled.
  The settled decisions:

{DECISIONS}

## Files

- Don't read `.claude/skills/usability-hill-climb/`. It holds the task cards and the holdout
  tasks, and a fix that knows them can teach to the test.
- Edit only the files in the folder of `{TARGET}`. Don't touch `README.md`, `PARSING.md`,
  `src/`, `tests/`, `.changeset/`, `.github/`, `package.json` or a config file.
- If you change `docs/site.css`, build `docs/tailwind.css` again, as `CONTRIBUTING.md` says.
  Use only existing tokens and classes when you can.
- Don't commit, branch or push. The agent that started you commits each round.

## Gates

When you finish, run each gate in "2. Gates" of `.claude/skills/design-hill-climb/SKILL.md`, in
`{REPO}`. Each one must pass. Don't change a test, a lint rule or the spell checker's word list to
make a gate pass (AGENTS.md pull request rule 3). Reword the page instead. If `pnpm` isn't on
PATH, follow `CONTRIBUTING.md`, and never use `--no-verify`.

## Look at it

Take screenshots with `pnpm docs:shot` at 1440px and 390px, in light and in dark, of the parts
that you changed. Check that the change fits the existing design: same components, spacing and
tokens. Write scratch files only in `{SCRATCH}`.

## Snapshot

After the gates pass, copy the folder of `{TARGET}` to `{SNAPSHOT}`, with each file in it.

## Report

Don't ask questions or wait for approval. When something is unclear, choose the option that
agrees with the README and this brief, go on, and list the decision in your report. Reply with:

- What you changed for each blocker, and the section.
- Each thing that you didn't do, and why.
- Each decision that you made.
- The result of each gate.
