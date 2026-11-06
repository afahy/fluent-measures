---
'@afahy/fluent-measures': patch
---

Accept large height conversions whose target value is finite even when an intermediate
centimeter value overflows. Preserve rounding for existing finite conversions.
