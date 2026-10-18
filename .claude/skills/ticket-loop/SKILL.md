---
name: ticket-loop
description: Work through this repository's `agent-ready` Linear tickets one after another, from the claim to the merge. Use only when the maintainer asks you to work tickets, to start the ticket loop, or to pick the next ticket.
---

# Working tickets in a loop

`AGENTS.md` gives the rules for each ticket and each PR. This file adds only the loop: which
ticket to take next, how to work on tickets at the same time, and when to stop.

## Pick a ticket

- Pick the next `agent-ready` ticket whose blockers are done. Skip tickets that are In Progress
  or In Review. Order tickets by milestone number, then priority, then lowest ID. Take tickets
  with no milestone last.
- Build it as `AGENTS.md` says, from the claim to the merge.

## Work on tickets at the same time

- While a PR waits for merge, you may start a ticket that changes different files, in its own
  worktree. Do tickets that change the same files one at a time.
- After a PR merges and you pull `main`, merge `main` into each other open agent PR in its
  worktree, and run lint and the tests. Push the merge only if it has a conflict or a check
  fails, and fix the branch first.

## Go on to the next ticket

- When CI on `main` passes after a merge, pick the next ticket.
- When a ticket needs a "Stop and ask" decision, ask as `AGENTS.md` says. Then pick the next
  ticket.
- While tickets are left, don't end a turn with a report only because the turn is long or a
  milestone is done.
- Stop when no `agent-ready` ticket is left that you can start, and each open PR waits on the
  maintainer. Then report each PR and ticket that waits on the maintainer.
