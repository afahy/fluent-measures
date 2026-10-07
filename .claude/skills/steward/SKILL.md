---
name: steward
description: Watch this repository's pull requests until they merge. Use after each push to a PR, when a GitHub event, timer or background command wakes you about a PR, and before you report a PR ready, merge it or close it. It says how to tell what a PR needs with `pnpm pr:status`, how to wait without spending tokens, and when to stop.
---

# Watching a pull request

`pnpm pr:status <pr>...` decides what a PR needs. It reads GitHub's REST API for the PR's head
commit and reports CI, Codex, CodeRabbit, bot threads with no reply and the merge state. Don't
write your own checks for any of these. Earlier sessions wrote about 50 watchers of their own,
and most of them misjudged the head commit, Codex's 👀 or CodeRabbit's rate limit. If
`pr:status` gets something wrong, fix `.github/scripts/pr-state.mjs` and add a test built from
the PR's real API responses.

## Each time you look at a PR

Run `pnpm pr:status <pr>` (or `pnpm pr:status 61 62 63` for several) and act on the state it
prints. Add `--json` if you need to parse the output. After a PR's third review round (AGENTS.md
"Handle findings and CI"), add `--no-requests`, so it waits for the bots instead of telling you
to ask them again.

| State           | Exit code | What to do                                                                                                                                     |
| --------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `needs-agent`   | 10        | Do each item under "Do", and handle each item under "Why" as AGENTS.md "Handle findings and CI" says. Push, then wait.                         |
| `waiting`       | 20        | Wait, as the next section says.                                                                                                                |
| `waiting-human` | 30        | Say once, in one line, what the maintainer needs to do. Then wait for the maintainer, as the next section says.                                |
| `ready`         | 0         | Do "Finish the PR" in AGENTS.md, then merge as "Merge your own PR" says. A PR that changes CODEOWNERS files is `waiting-human`, never `ready`. |
| `merged`        | 40        | Do the comment check from "Finish the PR" at once. `pr:status` still lists bot threads with no reply. Then do the rest of "Finish the PR".     |
| `closed`        | 41        | The same as `merged`.                                                                                                                          |

Read "Notes" as well. They list bot replies after yours, nitpicks, other bot comments since the
push, and bots that never reviewed the head commit. Act on findings as AGENTS.md says, and list
each gap in your report.

## Bot reviews

`pr:status` doesn't post anything. When "Do" lists `Post @codex review` or
`Post @coderabbitai review`, post that comment yourself, holding only the command. Don't offer
to post it. `pr:status` lists each request once per commit, as AGENTS.md says, and stops
waiting for a bot 2 hours after the bot could start. A PR that Codex never reviewed then waits
on the maintainer. Say so in your report.

## Waiting

Before you end a turn, make sure something will wake you when the PR changes. Never end a turn
while a PR is `needs-agent`, or while nothing is armed for a PR that's `waiting` or
`waiting-human`.

1. If the session can run a background command, run `pnpm pr:status <pr>... --wait` in the
   background, with every PR you're watching in one call. It polls without spending tokens. It
   returns when a PR needs you, is ready or closes, or when a PR that waits on the maintainer
   gets news. When it returns, act on what it printed. If it printed "Nothing changed in 100
   min.", run it again.
2. In a cloud session, also subscribe to the PR's GitHub events. The container can stop and take
   the background command with it. On each event or check-in, run `pnpm pr:status` first, and
   start `--wait` again if it isn't running. If the output is the same as last time, end the
   turn in one short line.
3. Use a timed check-in (`send_later`, a scheduled wake-up or cron) only when neither of those
   can wake you. Each check-in that misses the 1-hour prompt cache rewrites the whole
   conversation, which cost $1 to $3 a wake in earlier sessions. Hourly check-ins fire just past
   the cache's hour, so they always miss it.
   - While a PR is `waiting`, check in at most 50 minutes after the last turn, so the cache is
     still warm. After 3 check-ins in a row that find nothing new, the bots' 2 hours are over.
     If CI is still running then, report that it's stuck and stop.
   - While every PR is `waiting-human`, check in every 4 hours, for up to 24 hours. Don't ask
     the maintainer to tell you when they merge.

## CI on main

`pnpm pr:status` doesn't cover `main`. After a merge, watch CI on `main` by the merge commit's
full SHA, for example with `gh api repos/afahy/fluent-measures/commits/<sha>/check-runs`. An
empty or short list right after the merge means the runs haven't started yet, so wait until the
CI workflow's checks are there and finished. Don't use `gh run list --branch main`, which hid
queued runs during an Actions incident.
