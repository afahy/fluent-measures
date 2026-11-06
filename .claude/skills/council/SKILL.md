---
name: council
description: Get independent feedback from three model providers on a difficult decision, design or code change. Use when the maintainer requests a council review. For docs design or first-use usability hill-climbing, use the corresponding repository skill.
---

# Council

Run a bounded panel review of the maintainer's request. `AGENTS.md` still governs scope,
findings, checks, tickets and shipping. Council adds neither merge permission nor a new
mandatory review for ordinary tickets. A request for advice or review alone authorizes no
implementation, push or PR. Fix and ship only when the surrounding task authorizes that work.

This workflow draws on the [council and sol-loop skills](https://github.com/t3dotgg/tstack).

## Scope and budget

- Default to three providers, one strong model each, at high reasoning effort where supported.
  Honor the maintainer's named models. Resolve available models at runtime; do not hardcode IDs
  or silently substitute a provider. If a requested provider cannot run, report the limitation
  and ask whether to use a smaller panel.
- Default to at most 3 rounds. A round is one panel assessment of a frozen candidate. A fresh
  assessment after fixes consumes another round. Extend only when the maintainer requests it.
  This budget is separate from, and does not reset, the PR bot-review budget in `AGENTS.md`.
- State the request, constraints and exclusions in a short brief. For code, record the base
  SHA, candidate SHA and scoped paths after fetching the base branch. Include scoped uncommitted
  and untracked files, if any; preserve unrelated work. Use the same base throughout the review.
- When implementation is authorized, fix known issues and run relevant checks before review.
  Otherwise record them in the brief. Do not edit the candidate while the panel runs.
- Start a scratch ledger using [ledger.md](ledger.md). Record provider, model, round and usage
  only when the tools expose them. Missing usage is `not available`, never an estimate.

## Review

Start one independent agent per provider with the same task evidence and no inherited parent
conversation. In T3 Code, resolve models with `orchestrator_capabilities` and use `delegate_task`
for cross-provider reviews, with settings in `target.options`. Use the harness's native tool
for a same-provider model when appropriate. Follow the tool's waiting instructions. Each T3
re-check is a new delegation, not a message to an old review thread.

Give each reviewer these rules along with the scope and evidence:

- Review only. Do not edit, commit, push, post comments or start subagents.
- Assess the requested decision or change. Ground each finding in a file and line, observed
  behavior, specification, or calculation. Explain its effect and the smallest useful repair.
- Use the repository's "Handle findings and CI" rules to judge importance. A plausible rare
  edge case in agent tooling is not automatically worth fixing.
- Give findings stable IDs and classify them as blocker, should or nit, as the ledger defines.
  Do not manufacture findings or request unrelated improvements to fill a list.
- For code reviews, return `VERDICT: APPROVE` or `VERDICT: CHANGES`, followed by findings. For a
  decision review, give your recommendation, evidence and unresolved tradeoffs. A score is
  optional and informational; correctness and approval do not follow from a numeric score.

Do not give one reviewer another's findings during the first round. Collect all responses
before synthesizing them. A missing, failed or timed-out review is not approval; cancel an
obsolete run before replacing it. A replacement panel assessment uses the remaining budget.

## Resolve and re-check

Validate each finding yourself under `AGENTS.md`; do not accept it by majority vote. Track the
decision and evidence in the ledger. If fixes are authorized, make the smallest in-scope fix
and run the required checks. Keep declined nits and out-of-scope work out of the diff.

For code, later rounds examine changed code and open findings, with enough surrounding context
to check callers. Send the original scope, the ledger, the base diff and the diff since the last
assessment. Ask reviewers to mark each open ID resolved or still open, with a reason. Start
another round only for an open blocker/should, a behavior change, or a behavior diff the panel
has not approved. Declined nits and comment or formatting changes alone need no new round;
functional documentation changes do. The coordinator still reviews the whole final diff as
`AGENTS.md` requires before declaring the PR ready or merging.

## Finish

- For advice, report the recommendations, disagreements and your judgment. Agreement is not
  required to give the maintainer a useful decision brief.
- For code, report agreement only when every required reviewer approved the current behavior
  diff, no valid in-scope blocker or should remains, and required checks pass. Declined findings
  need evidence; a dissenting verdict does not become approval because others disagree.
- If a finding remains disputed after two responses to it, or the round budget ends, report the
  competing evidence and ask the maintainer to decide or extend the review. State that review
  is incomplete. Do not convert missing approval or exhausted budget into permission to ship.
- Put rounds, reviewers, verdicts, fixed and declined findings, remaining issues and exposed
  usage in the final reply. For an authorized PR, keep them under the existing Description
  heading, preserving its template; use no extra status comment. Then follow the repository's
  normal PR process. Council approval does not replace required CI or bot reviews.
