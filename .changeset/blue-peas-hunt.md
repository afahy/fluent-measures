---
'@afahy/fluent-measures': patch
---

Normalize thousands separators and decimal commas, including fractions without a leading zero, so measurements such as 1,000 lbs and 72,5 kg retain their complete values. Normalize these numbers before rejecting shared-unit ranges and parsing bare height shorthand such as 5-11,5. Preserve comma separators after Unicode labels and labels ending in digits. Reject malformed combinations of numeric comma groups instead of returning partial or reinterpreted values.
