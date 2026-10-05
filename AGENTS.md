# Repository instructions for coding agents

## Commands

Run these commands from the repository root:

- `pnpm install` installs dependencies.
- `pnpm lint` runs ESLint, Prettier checks, and the spell checker.
- `pnpm test` runs the unit tests and TypeScript (`tsc`) checks.
- `pnpm test:unit:coverage` runs the unit tests with coverage.
- `pnpm test:mutation` runs mutation testing with Stryker. CI fails if the mutation score is
  below the `break` threshold in `stryker.config.json`.
- `pnpm build` builds the package.

## Pull request rules

1. Use one Linear ticket per PR. Reference it only on the `Fixes` line of the PR template,
   as `Fixes AFA-n`. If the PR covers only part of the ticket, write `Part of AFA-n`
   instead, so Linear doesn't close the ticket when the PR merges. Don't put the ticket ID
   in the PR title.
2. Every bug fix must add a regression test built from the ticket's failure inputs. Confirm
   that the test fails on `main` and passes with the fix, and say that you checked this in
   the PR body.
3. Never skip, delete, loosen, or mark an existing test as expected to fail just to make CI
   pass.
4. Add a changeset with `pnpm changeset` for any change to `src/` or to `package.json`
   fields that affect consumers.
5. Commit messages and PR titles follow Conventional Commits, as configured in
   `commitlint.config.js`. CI checks both, and checks titles against
   `commitlint.pr-title.config.js` as well. Write PR titles as `type: summary`, for example
   `fix: make the changeset reminder non-blocking`. Allowed types are `feat`, `fix`,
   `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore` and `revert`. A
   scope is optional, and the only allowed scopes are `core`, `docs`, `deps`, `ci` and
   `config`. Keep titles to 65 characters or fewer: squash merging appends ` (#NN)`, and
   the commit on `main` must fit in 72.
6. The ESLint config is `eslint.config.js`.
7. README examples are the public specification. When code and README disagree, follow
   the ticket's direction about which one changes. If the ticket does not say, ask on the
   ticket.
8. Do not add, edit or delete files that match a pattern in `.github/CODEOWNERS` unless the
   ticket asks for it.
9. Never merge a PR or use a branch-protection bypass. Do not enable auto-merge until
   AFA-29 is complete. Agents open PRs from the maintainer's GitHub account, so this rule
   keeps merging a human step.
10. Write every PR description from `.github/pull_request_template.md`. Keep all of its
    headings in the same order and fill in each section; don't replace it with your own
    format. Fill in the `Fixes` line as rule 1 says. Under "Type of change", delete the
    options that don't apply. Under "How Has This Been Tested?", replace `Test A` and
    `Test B` with the commands you ran and, for a bug fix, the check from rule 2. Tick only
    the checklist items that are true. Don't change the version in `package.json`;
    changesets sets it at release time.

## Work without asking

The maintainer reviews every PR before it merges, and that review is the human check. This
section is the maintainer's standing approval for the steps below. Do them without asking,
and list them in your report:

- Run `pnpm install`, the tests, lint, mutation testing and the build.
- For an `agent-ready` ticket, create the branch, commit, push and open the PR. Then move
  the ticket to In Review.
- Before you open the PR, review your own diff and fix the findings that are in scope. In
  Claude Code, use the `code-review` skill at `high`.
- After each push, watch CI and the Codex and CodeRabbit reviews until each one finishes.
  If a watch expires first, start it again. Don't ask whether to watch.
- If CodeRabbit's rate limit has reset, or Codex hasn't reviewed a commit after 30 minutes,
  comment `@coderabbitai review` or `@codex review` on the PR.
- Reproduce each review finding before you act on it. Then:
  - If this PR causes it, or the ticket covers it, fix it with a regression test and push.
  - If `main` gives the same result and the ticket doesn't cover it, file a Linear ticket
    with the failing inputs and a "must not change" list. Label it `agent-ready`, or
    `needs-decision` if it needs one of the decisions under "Stop and ask".
  - If you can't reproduce it, reply on the thread with the inputs you ran.
- Reply to each bot thread. Resolve each thread that a pushed commit fixes.
- After three review rounds on one PR, stop waiting for more bot reviews and report the PR
  as ready to merge. A round is one push and the bot reviews of that push.
- If a CI job fails because no runner picked it up, re-run the failed jobs. If GitHub
  reports an Actions incident, wait until it ends.
- When you report a PR as ready to merge, watch it until it merges or closes. Don't ask the
  maintainer to tell you.
- After the PR merges, pull `main`. Delete the local branch after you confirm that `main`
  has its changes. Watch CI on `main`, then start the next unblocked `agent-ready` ticket in
  milestone order.
- While a PR waits for merge, you may start a ticket that changes different files, in its
  own worktree. Do tickets that change the same code one at a time.

## Make your own decisions

When a question comes up during a ticket, apply the first rule below that answers it. Record
each decision under "Description" in the PR body. If a decision changes the ticket's scope
or expected results, add a ticket comment too. The maintainer can change any decision at
merge review.

1. The README is the specification. Keep each result that the README or an existing test
   shows, unless the ticket accepts the change.
2. Keep each result that `main` gives, unless the ticket asks for the change. If a fix must
   change a result, list it in the PR.
3. If a second bug has the same cause and the same fix location, and the fix breaks no
   existing test, fix it in the same PR.
4. If two parts of a ticket conflict, choose the option that changes the fewest results
   from `main`. Update the ticket to match.
5. In all other cases, use your own recommendation and continue. Don't stop to ask unless
   "Stop and ask" lists the question.

## Stop and ask

Ask the maintainer only about these decisions:

- Changing a file in `.github/CODEOWNERS` that the ticket doesn't name (rule 8).
- Changing a README example that the ticket doesn't name (rule 7).
- Changing the exported types or the public API.
- Raising the bundle size budget.

Write the question, the options and your recommendation in a comment on the Linear ticket,
and label the ticket `needs-decision`. Then continue with the next unblocked ticket. Don't
wait for the answer.

Ask in your report before you delete work that isn't on `main`, such as an unmerged branch
or a stash. Merging stays with the maintainer (rule 9).
