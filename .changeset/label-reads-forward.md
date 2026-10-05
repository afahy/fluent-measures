---
'@afahy/fluent-measures': patch
---

Read the number after a unit label, so "age=28, in=72" returns 72 in instead of 28 in, and "id=7, m=1.8" returns 1.8 m instead of 7 m. A label still reads the number before it when none follows, as in "72 (in)".
