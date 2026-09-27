---
'@afahy/fluent-measures': patch
---

Normalize thousands separators and decimal commas so measurements such as 1,000 lbs and 72,5 kg retain their complete values. Normalize these numbers before rejecting shared-unit ranges and parsing bare height shorthand such as 5-11,5.
