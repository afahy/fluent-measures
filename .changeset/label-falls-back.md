---
'@afahy/fluent-measures': patch
---

Keep the value before a label in brackets, or `in.`, when the number after the label has its own unit. So "72 (in), 180 lbs" returns 72 in again instead of 180 lb, and "1.8 (m), 80 kg" returns 1.8 m instead of 80 kg. A label before ":" or "=" is a field name, in brackets too, so it still doesn't take the number before it when a number follows: "age=28 in=180 lbs", "72 in: 180 lbs" and "age 28 (in): 180 lbs" return 180 lb. A label after a comma, semicolon, colon, equals sign or "&" never takes the number of the field before it, so "age=28, in:" returns null instead of 28 in. "age=28, in=72" still returns 72 in.
