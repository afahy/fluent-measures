---
name: steward
description: Watch this repository's pull requests until they merge. Use after each push to a PR, when a GitHub event, timer or background command wakes you about a PR, and before you report a PR ready, merge it or close it. It says how to tell what a PR needs with `pnpm pr:status`, how to wait without spending tokens, and when to stop.
---

# Watching a pull request

`pnpm pr:status <pr>...` decides what a PR needs. It reads GitHub's REST API for the PR's head
commit and reports CI, Codex, CodeRabbit, bot threads with no reply and the merge state. Don't
write your own checks for any of these. Earlier sessions wrote about 50 watchers of their own,
and most of them misjudged the head commit, Codex's 👀 or CodeRabbit's rate limit. If
`pr:status` gets something wrong, don't change it in the PR you're watching. File a ticket for
`.github/scripts/pr-state.mjs` with a test built from the PR's real API responses.

## Each time you look at a PR

Run `pnpm pr:status <pr>` (or `pnpm pr:status 61 62 63` for several) and act on the state it
prints. Add `--json` if you need to parse the output. After a PR's third review round (AGENTS.md
"Handle findings and CI"), add `--no-requests`, so it waits for Codex instead of telling you to
ask it again. The flag applies to every PR in the call, so check PRs past their third round in a
separate call.

| State           | Exit code | What to do                                                                                                                                 |
| --------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `needs-agent`   | 10        | Do each item under "Do", and handle each item under "Why" as AGENTS.md "Handle findings and CI" says. Push if you changed code, then wait. |
| `waiting`       | 20        | Wait, as the next section says.                                                                                                            |
| `waiting-human` | 30        | Say once, in one line, what the maintainer needs to do. Then wait for the maintainer, as the next section says.                            |
| `ready`         | 0         | Do "Finish the PR" in AGENTS.md, then merge as "Merge your own PR" says.                                                                   |
| `merged`        | 40        | Do the comment check from "Finish the PR" at once. `pr:status` still lists bot threads with no reply. Then do the rest of "Finish the PR". |
| `closed`        | 41        | The same as `merged`.                                                                                                                      |

Read "Notes" as well. They list bot replies after yours, nitpicks, other bot comments since the
push, and bots that never reviewed the head commit. Act on findings as AGENTS.md says, and list
each gap in your report.

## Bot reviews

`pr:status` doesn't post anything. When "Do" lists `Post @codex review`, post that comment
yourself, as `Agent: @codex review`. Codex acts on a request with the `Agent:` prefix. Don't
offer to post it. `pr:status` lists each request once per commit, as AGENTS.md says, and stops
waiting for Codex 2 hours after it could start. A PR that Codex never reviewed then waits on the
maintainer. Say so in your report.

`pr:status` never waits for CodeRabbit and never asks it to review (AFA-138). Its threads, its
comments outside the diff and its requested changes still make a PR `needs-agent`. When it
hasn't reviewed the head commit, a note says so. List that gap in your report.

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
   background. Put the PRs that you're watching in one call, and the PRs past their third review
   round in a second call with `--no-requests`. It polls without spending tokens. It returns when
   a PR needs you, is ready or closes, or when a PR that waits on the maintainer gets news. It
   gives up after `--timeout` minutes, 100 by default. Give the background command a longer
   timeout than that: Claude Code stops a background command after 30 minutes unless you set a
   timeout, up to 2 hours. When a call returns, act on what it printed. Then run that call
   again, and leave the other call running. Leave out each PR that merged or closed, and each
   `ready` PR that only the maintainer may merge, because `--wait` returns at once for it. Once
   every PR in both calls is `waiting-human`, don't run them again. Each return wakes you past
   the prompt cache, so wait as step 3 says instead.
2. In a cloud session, also subscribe to the PR's GitHub events. The container can stop and take
   the background command with it. On each event or check-in, run `pnpm pr:status <pr>...`
   first, as "Each time you look at a PR" says. Then start the `--wait` calls again if they
   aren't running, unless every PR that they would watch is `waiting-human`. If the output is the
   same as last time, end the turn in one short line.
3. Use a timed check-in (`send_later`, a scheduled wake-up or cron) when neither of those can
   wake you. Use one also for each PR that waits on the maintainer and that `--wait` doesn't
   watch, even when a background command could run. One such PR is a `ready` PR that only the
   maintainer may merge. Leave it out of `--wait`, which returns at once for it. The others are
   the `waiting-human` PRs after step 1 stops the `--wait` calls. Each check-in that misses the
   1-hour prompt cache rewrites the whole conversation, which cost $1 to $3 a wake in earlier
   sessions. Hourly check-ins fire just past the cache's hour, so they always miss it.
   - While a PR is `waiting`, check in 40 to 50 minutes after the last turn, so the cache is
     still warm. After 3 check-ins in a row that find nothing new, Codex's 2 hours are over.
     If CI is still running then, report that it's stuck and stop.
   - For a PR that waits on the maintainer, check in every 4 hours, for up to 24 hours. Don't
     ask the maintainer to tell you when they merge.

## CI on main

`pnpm pr:status` doesn't cover `main`. After a merge, watch CI on `main` by the merge commit's
full SHA. Its result is the CI workflow's `ci-ok` check, for example from
`gh api 'repos/afahy/fluent-measures/commits/<sha>/check-runs?check_name=ci-ok'`. `ci-ok` starts
after the other CI jobs end, and it fails when one of them fails. Wait until it is there and its
status is `completed`, then read its conclusion. If `ci-ok` fails, or isn't there 45 minutes
after the merge, read the commit's other check runs. Find the CI job that failed, or the one
that no runner picked up. Workflows other than CI, such as `pr-status.yml`,
`late-bot-findings.yml` and `deploy-docs.yml`, add check runs to the merge commit too. Their
results aren't CI results. Don't use `gh run list --branch main`, which hid queued runs during
an Actions incident.
