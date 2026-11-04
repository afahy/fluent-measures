---
'@afahy/fluent-measures': minor
---

Keep a label's number word separate from digits after a comma and space, so `phase twenty, 5 cm`
returns 5 cm and `I am forty, 5 kg overweight` returns 5 kg.

Reject incomplete weights such as `stone twenty, 4 lb` while preserving a later independent
weight after a signed part, as in `stone -5 lb; actual 70 kg`.
