---
'@afahy/fluent-measures': minor
---

Reject incomplete weights when a signed unit-first supported part is followed by a separately
numbered stone, ounce or gram part, including across spaces and semicolons. These inputs now
return `null` instead of a later independent weight.
