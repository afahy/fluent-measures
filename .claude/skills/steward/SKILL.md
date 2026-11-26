---
name: steward
description: Watch this repository's pull requests until they merge. Use after each push to a PR, when a GitHub event, timer or background command wakes you about a PR, and before you report a PR ready, merge it or close it. It says how to tell what a PR needs with `pnpm pr:status`, how to wait without spending tokens, and when to stop.
---

# Watching a pull request

`pnpm pr:status <pr>...` decides what a PR needs. It reads GitHub's REST API for the PR's head
commit and reports CI, unanswered review findings and the merge state. Don't write your own
checks for these. If `pr:status` gets something wrong, file a ticket for
`.github/scripts/pr-state.mjs` with a test built from the PR's real API responses. Keep that fix
in its own PR.

## Each time you look at a PR

Run `pnpm pr:status <pr>` (or `pnpm pr:status 61 62 63` for several) and act on the state it
prints. Add `--json` if you need to parse the output.

| State           | Exit code | What to do                                                                                                                                 |
| --------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `needs-agent`   | 10        | Handle each item under "Why" as AGENTS.md "Handle findings and CI" says. Push if you changed code, then wait.                              |
| `waiting`       | 20        | Wait, as the next section says.                                                                                                            |
| `waiting-human` | 30        | Say once, in one line, what the maintainer needs to do. Then wait for the maintainer, as the next section says.                            |
| `ready`         | 0         | Do "Finish the PR" in AGENTS.md, then wait for the maintainer.                                                                             |
| `merged`        | 40        | Do the comment check from "Finish the PR" at once. `pr:status` still lists bot threads with no reply. Then do the rest of "Finish the PR". |
| `closed`        | 41        | The same as `merged`.                                                                                                                      |

Read "Notes" for bot replies and other recent comments. Handle findings as AGENTS.md says.
Review requests and in-progress bot reviews do not affect the status. Existing Codex and Claude
findings, including Claude summaries posted by `github-actions[bot]`, still need an answer.

## Waiting

Before you end a turn, make sure something will wake you when the PR changes. Never end a turn
while a PR is `needs-agent` for a reason you can act on, or while nothing is armed for a PR
that's `waiting` or `waiting-human`. There are two exceptions:

- A PR can stay `needs-agent` for a reason you can't clear yet, for example failed CI on a draft
  that waits on a maintainer's decision ("Stop and ask" in AGENTS.md), or a CI failure during a
  GitHub Actions incident. Leave that PR out of `--wait`, which would return at once, and say so
  in your report.
- When the timed check-ins in step 3 run out, say so in your report and stop.

1. If the session can run a background command, run `pnpm pr:status <pr>... --wait` in the
   background. It polls until a PR needs you, is ready or closes, or until a PR waiting on a
   person gets news. It gives up after `--timeout` minutes, 100 by default. Give the background
   command a longer timeout. Claude Code stops a background command after 30 minutes unless you
   set a timeout, up to 2 hours. When a call returns with a state, or with "Nothing changed in …
   min.", act on what it printed, then run the call again for any PRs still waiting on CI.
   A call can also end with an error, or Claude Code can stop it at its timeout. Then read what
   it printed. Exit code 3 means that GitHub refused the token, and 2 that an argument is wrong.
   With code 1 after a 404 or 422, a PR number or the repository is wrong. Fix these before you
   run the call again. Network errors, server errors and rate limits end the call after five
   tries in a row. The next try can come after `--timeout`. Then the call ends with the error,
   and also prints its last result if it has one. After an error, run the call again after 10
   minutes, or after the rate limit resets. Do this also when "Nothing changed" names an error.
   Arm a timed check-in for that time, such as a scheduled wake-up. When you run a call again,
   leave out each PR that merged or closed and each `ready` PR, because `--wait` returns
   at once for those states. If every remaining PR is `waiting-human`, follow step 3.
2. In a cloud session, also subscribe to the PR's GitHub events. The container can stop and take
   the background command with it. On each event or check-in, run `pnpm pr:status <pr>...`
   first, as "Each time you look at a PR" says. Restart `--wait` if it stopped and a PR is
   still waiting on CI. If the output is the same as last time, end the turn in one short line.
3. Use a timed check-in (`send_later`, a scheduled wake-up or cron) when neither of those can
   wake you. Use one also for each PR that waits on the maintainer and that `--wait` doesn't
   watch, including a `ready` PR awaiting merge.
   - While a PR is `waiting`, check in 40 to 50 minutes after the last turn, so the cache is
     still warm. After three check-ins in a row with CI still running, report that it is stuck
     and stop.
   - For a PR that waits on the maintainer, check in every 4 hours, for up to 24 hours. Don't
     ask the maintainer to tell you when they merge.

## CI on main

`pnpm pr:status` doesn't cover `main`. After a merge, watch CI on `main` by the merge commit's
full SHA. Its result is the CI workflow's `ci-ok` check, for example from
`gh api 'repos/afahy/fluent-measures/commits/<sha>/check-runs?check_name=ci-ok'`. `ci-ok` starts
after the other CI jobs end, and it fails when one of them fails. Wait until it is there and its
status is `completed`, then read its conclusion. If the conclusion isn't `success`, or `ci-ok`
hasn't completed 45 minutes after the merge, read the commit's other check runs. A `ci-ok` that
hasn't completed can be missing, or have a status such as `queued` or `in_progress`. Find the CI
job that failed or was cancelled, or the one that no runner picked up. If you find none, report
that CI on `main` is stuck, and stop. A push to `main` runs only CI's `test` and `package`
jobs, so its `ci-ok` doesn't cover mutation testing or the docs audit. `nightly.yml` runs them
on `main` each night. Its check runs are named `ci / <job>`, so they don't match the `ci-ok`
query, and they aren't part of watching a merge. Workflows other than CI, such as `pr-status.yml`,
`late-bot-findings.yml` and `deploy-docs.yml`, add check runs to the merge commit too. Their
results aren't CI results. Don't use `gh run list --branch main`, which hid queued runs during
an Actions incident.

Once the merge's `ci-ok` passes, also read the conclusion of the last completed Nightly run, for
example from
`gh run list --repo afahy/fluent-measures --workflow nightly.yml --branch main --status completed --limit 1 --json conclusion,headSha,url`.
If it isn't `success`, report the failure and its URL with your result. A Nightly failure is a
failure on `main` that no push showed, so it isn't caused by the PR that you merged.
