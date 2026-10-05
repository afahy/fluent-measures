---
'@afahy/fluent-measures': patch
---

Read the number after any unit label, not only "in" and "m", so "age=28, kg=72" returns 72 kg instead of 28 kg, and "age: 28, ft: 6" returns 6 ft instead of 28 ft 6 in. A unit in brackets or before ":" or "=" is a label. When the number after it has its own unit, the label takes the number before it, as before, so "180 lbs = 82 kg" still returns 180 lb. A label after a comma, semicolon, colon, equals sign or "&" never takes the number of the field before it, so "age=28, kg=0" and "age=28, kg=" return null.
