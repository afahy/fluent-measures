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
prints. Add `--json` if you need to parse the output.

| State           | Exit code | What to do                                                                                                                        |
| --------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `needs-agent`   | 10        | Do each item under "Do", and handle each item under "Why" as AGENTS.md "Handle findings and CI" says. Push, then wait.            |
| `waiting`       | 20        | Wait, as the next section says.                                                                                                   |
| `waiting-human` | 30        | Say once, in one line, what the maintainer needs to do. Arm no timer.                                                             |
| `ready`         | 0         | Do "Finish the PR" in AGENTS.md. Merge if "Merge your own PR" allows it. If not, report it ready and treat it as `waiting-human`. |
| `merged`        | 40        | Do the comment check from "Finish the PR". `pr:status` still lists bot threads with no reply. Then stop watching the PR.          |
| `closed`        | 41        | The same as `merged`.                                                                                                             |

Read "Notes" as well. They list bot replies after yours, nitpicks, other bot comments since the
push, and bots that never reviewed the head commit. Act on findings as AGENTS.md says, and list
each gap in your report.

## Waiting

- If the session can run a background command, run `pnpm pr:status <pr>... --wait` in the
  background, with every PR you're watching in one call. It polls without spending tokens. It
  returns when a PR needs you, is ready or closes, or when a PR that waits on the maintainer
  gets news. When it returns, act on what it printed. If it printed "Nothing changed in 100
  min.", run it again.
- In a cloud session, also subscribe to the PR's GitHub events, because the container can stop
  and take the background command with it. On each event or check-in, run `pnpm pr:status`
  first. If its output is the same as last time, end the turn in one short line.
- Don't end a turn while a PR is `needs-agent` or `waiting` and nothing is armed to wake you.
- A timed check-in (`send_later`, a scheduled wake-up or cron) is only a backup for events. Never
  arm one while every PR is `waiting-human`. Space check-ins 50 minutes apart or less, or 4
  hours apart or more. A check-in that fires 55 to 65 minutes after the last turn just misses
  the 1-hour prompt cache, so it rewrites the whole conversation, which cost $1 to $3 a wake in
  earlier sessions. Stop after 3 check-ins in a row that find nothing new.

## Bot reviews

- Post each request listed under "Do" yourself, as a comment that holds only the command:
  `@codex review` or `@coderabbitai review`. Don't offer to post it.
- `pr:status` asks each bot once per commit, as AGENTS.md says, and stops waiting for a bot 2
  hours after the bot could start. A PR that Codex never reviewed waits on the maintainer.
  Say so in your report.

## CI on main

After a merge, watch CI on `main` by the merge commit's full SHA, for example with
`gh api repos/afahy/fluent-measures/commits/<sha>/check-runs`. Don't use
`gh run list --branch main`, which hid queued runs during an Actions incident.
