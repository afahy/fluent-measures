---
'@afahy/fluent-measures': patch
---

Keep the value before a label when the number after it has its own unit, so "72 (in), 180 lbs" returns 72 in again instead of 180 lb, and "1.8 (m), 80 kg" returns 1.8 m instead of 80 kg. A label after a comma, semicolon, colon, equals sign or "&" doesn't take the number of the field before it, so "age=28, in=180 lbs" still returns 180 lb, and "age=28, in:" returns null instead of 28 in. "age=28, in=72" still returns 72 in.
