---
'@afahy/fluent-measures': patch
---

A hyphen after an inch mark now joins two values, as a hyphen after "in" does. So `5"-5 in` now returns 5 in, as `5 in-5 in` does. It returned `null` before.
