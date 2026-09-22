# Repository instructions for coding agents

<!-- cspell:ignore CODEOWNERS -->

## Commands

Run these commands from the repository root:

- `pnpm install` installs dependencies.
- `pnpm lint` runs ESLint, Prettier checks, and the spell checker.
- `pnpm test` runs the unit tests and TypeScript (`tsc`) checks.
- `pnpm test:unit:coverage` runs the unit tests with coverage.
- `pnpm build` builds the package.

## Pull request rules

1. Use one Linear ticket per PR. Put its ticket ID (`AFA-n`) in the PR title or body.
2. Every bug fix must add a regression test built from the ticket's failure inputs. Confirm
   that the test fails on `main` and passes with the fix, and say that you checked this in
   the PR body.
3. Never skip, delete, loosen, or mark an existing test as expected to fail just to make CI
   pass.
4. Add a changeset with `pnpm changeset` for any change to `src/` or to `package.json`
   fields that affect consumers.
5. Follow Conventional Commits for commit messages, as configured in
   `commitlint.config.js`.
6. The ESLint config is `eslint.config.js`. `.eslintrc.json` is unused; do not edit it.
7. README examples are the public specification. When code and README disagree, follow
   the ticket's direction about which one changes. If the ticket does not say, ask on the
   ticket.
8. Do not edit files listed in `.github/CODEOWNERS` unless the ticket asks for it.
9. Never merge a PR or use a branch-protection bypass. Do not enable auto-merge until
   AFA-29 is complete. Agents open PRs from the maintainer's GitHub account, so this rule
   keeps merging a human step.
