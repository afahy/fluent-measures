---
'@afahy/fluent-measures': patch
---

With `fuzzy: true`, read a few more common typos that the one-error rule doesn't accept:
`lbss` and `Ibs` as pounds, `cenitmeters` as centimeters, and the number words `fourty` and
`ninty` as forty and ninety, so `fourty-two kg` reads as 42 kg. PARSING.md lists each typo with
its reason. Without `fuzzy`, nothing changes.

<!-- cspell:ignore lbss cenitmeters fourty ninty -->
