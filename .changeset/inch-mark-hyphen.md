---
'@afahy/fluent-measures': patch
---

A hyphen after an inch mark now joins two values, as a hyphen after a feet mark already does. So `5"-5 in` now returns 5 in, as `5 in-5 in` does, and `6'1"-185 lbs` with `type: 'weight'` returns 185 lb. Both returned `null` before.
