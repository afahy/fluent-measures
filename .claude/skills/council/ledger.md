# Findings ledger

Keep one coordinator-owned ledger per run. Feedback reviewers may receive it; blind design
judges and first-use usability reviewers must not.

| ID  | Location and finding | Evidence | Severity | Reviewers | Outcome and reason | Verified on |
| --- | -------------------- | -------- | -------- | --------- | ------------------ | ----------- |

Assign IDs such as F1 and F2 once. Reuse an ID when reviewers describe the same problem in the
same place; never renumber after a fix. Keep a reviewer's original ID as an alias if needed.

Usability runs retain the S1–S4 severity and blocker rules in `synthesis.md.tmpl`; use this
ledger for IDs, evidence and outcomes without replacing that classification. Other runs use:

- **Blocker:** a showstopper under `AGENTS.md`, or a mandatory design/behavior gate failure.
- **Should:** a concrete, in-scope defect worth fixing under `AGENTS.md`, or an evidenced design
  problem that materially affects readers.
- **Nit:** a subjective preference or other finding that does not justify a fix in this task.

Outcomes are `open`, `fixed`, `disputed`, `declined` or `filed`. Record the reason and evidence
for each outcome, and a ticket link for `filed`. A filed in-scope blocker remains unresolved
for acceptance; filing is not a way to pass a gate. Mark `fixed` only after inspecting the
changed artifact or running the relevant check, recording its commit or snapshot.

For code, reproduce and assess findings as `AGENTS.md` says. For design, cite the screenshot,
location or measured gate failure. For usability, use the existing trace and grade evidence.
After a revert, reopen findings whose fixes it removed. An unchanged candidate with only
declined nits needs no fix round. Do not weaken a required final assessment or whole-diff
review to avoid a round.
