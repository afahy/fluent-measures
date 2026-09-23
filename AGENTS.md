# Repository instructions for coding agents

## Commands

Run these commands from the repository root:

- `pnpm install` installs dependencies.
- `pnpm lint` runs ESLint, Prettier checks, and the spell checker.
- `pnpm test` runs the unit tests and TypeScript (`tsc`) checks.
- `pnpm test:unit:coverage` runs the unit tests with coverage.
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
6. The ESLint config is `eslint.config.js`. `.eslintrc.json` is unused; do not edit it.
7. README examples are the public specification. When code and README disagree, follow
   the ticket's direction about which one changes. If the ticket does not say, ask on the
   ticket.
8. Do not edit files listed in `.github/CODEOWNERS` unless the ticket asks for it.
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
