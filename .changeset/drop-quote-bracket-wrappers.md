---
'@afahy/fluent-measures': minor
---

Quotation marks, parentheses and square brackets around an entry, around one measurement of a
pair, or around a number no longer make a measurement. `(180 cm)`, `"180 lbs"`, `“5’11””` and
`(180) lbs` now return `null`. Curly quotes and primes after a number are always feet and inch
marks, so `5’11”`, `5′11″` and `5´11´´` still give 71 inches. Brackets keep their other uses: unit
labels such as `Height (in): 72`, a smaller part such as `5 ft (11 in)`, and the second
measurement of a pair, as in `5'11" (180 lbs)`. The bundle is about 0.8 kB smaller.
