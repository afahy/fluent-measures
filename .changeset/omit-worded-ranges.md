---
'@afahy/fluent-measures': minor
---

Omit shared-unit numeric ranges joined by "to" or "between ... and ...", including "from ...
to ...". These ranges now return null instead of an endpoint, while independent measurements
elsewhere in the input retain their units.
