---
'@afahy/fluent-measures': patch
---

A hyphen after an inch mark now joins two values, as a hyphen after "in" does. So `5"-5 in` returns 5 in, not `null`, as `5 in-5 in` does.
