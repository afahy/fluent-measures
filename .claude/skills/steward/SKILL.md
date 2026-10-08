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
`.github/scripts/pr-state.mjs` with a test built from the PR's real API responses, as AGENTS.md
says for scripts under `.github/scripts/`.

## Each time you look at a PR

Run `pnpm pr:status <pr>` (or `pnpm pr:status 61 62 63` for several) and act on the state it
prints. Add `--json` if you need to parse the output. After a PR's third review round (AGENTS.md
"Handle findings and CI"), add `--no-requests`, so it waits for the bots instead of telling you
to ask them again. The flag applies to every PR in the call, so check PRs past their third round
in a separate call.

| State           | Exit code | What to do                                                                                                                                                 |
| --------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `needs-agent`   | 10        | Do each item under "Do", and handle each item under "Why" as AGENTS.md "Handle findings and CI" says. Push if you changed code, then wait.                 |
| `waiting`       | 20        | Wait, as the next section says.                                                                                                                            |
| `waiting-human` | 30        | Say once, in one line, what the maintainer needs to do. Then wait for the maintainer, as the next section says.                                            |
| `ready`         | 0         | Do "Finish the PR" in AGENTS.md, then merge as "Merge your own PR" says. A PR that changes files that CODEOWNERS covers is `waiting-human`, never `ready`. |
| `merged`        | 40        | Do the comment check from "Finish the PR" at once. `pr:status` still lists bot threads with no reply. Then do the rest of "Finish the PR".                 |
| `closed`        | 41        | The same as `merged`.                                                                                                                                      |

Read "Notes" as well. They list bot replies after yours, nitpicks, other bot comments since the
push, and bots that never reviewed the head commit. Act on findings as AGENTS.md says, and list
each gap in your report.

## Bot reviews

`pr:status` doesn't post anything. When "Do" lists `Post @codex review` or
`Post @coderabbitai review`, post that comment yourself, for example `Agent: @codex review`. Both
bots act on a request with the `Agent:` prefix. Don't offer to post it. `pr:status` lists each request once per commit, as AGENTS.md says, and stops
waiting for a bot 2 hours after the bot could start. A PR that Codex never reviewed then waits
on the maintainer. Say so in your report.

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
   background, with every PR you're watching in one call. It polls without spending tokens. It
   returns when a PR needs you, is ready or closes, or when a PR that waits on the maintainer
   gets news. It gives up after `--timeout` minutes, 100 by default. Give the background command
   a longer timeout than that: Claude Code stops a background command after 30 minutes unless
   you set a timeout, up to 2 hours. When it returns, act on what it printed. If it printed
   "Nothing changed in 100 min." and a PR is still `waiting`, run it again. Once every PR is
   `waiting-human`, don't run it again: each return wakes you past the prompt cache, so wait as
   step 3 says instead.
2. In a cloud session, also subscribe to the PR's GitHub events. The container can stop and take
   the background command with it. On each event or check-in, run `pnpm pr:status <pr>...`
   first, and start `--wait` again if it isn't running, unless every PR is `waiting-human`. If
   the output is the same as last time, end the turn in one short line.
3. Use a timed check-in (`send_later`, a scheduled wake-up or cron) only when neither of those
   can wake you. Each check-in that misses the 1-hour prompt cache rewrites the whole
   conversation, which cost $1 to $3 a wake in earlier sessions. Hourly check-ins fire just past
   the cache's hour, so they always miss it.
   - While a PR is `waiting`, check in 40 to 50 minutes after the last turn, so the cache is
     still warm. After 3 check-ins in a row that find nothing new, the bots' 2 hours are over.
     If CI is still running then, report that it's stuck and stop.
   - While every PR is `waiting-human`, check in every 4 hours, for up to 24 hours. Don't ask
     the maintainer to tell you when they merge.

## CI on main

`pnpm pr:status` doesn't cover `main`. After a merge, watch CI on `main` by the merge commit's
full SHA, for example with `gh api repos/afahy/fluent-measures/commits/<sha>/check-runs`. An
empty or short list right after the merge means the runs haven't started yet, so wait until the
CI workflow's checks are there and finished. Ignore `Set the PR status` check runs: they come
from `pr-status.yml`, not CI. Don't use `gh run list --branch main`, which hid queued runs during
an Actions incident.
