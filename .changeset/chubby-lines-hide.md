---
'@afahy/fluent-measures': patch
---

Preserve explicit zero components and leading-dot decimals in hyphenated heights, and support meter normalization and mixed spacing around feet units. Reject complete numeric ranges sharing one unit, including spaces and Unicode dashes. Preserve signs after exact or fuzzy unit prefixes, opening quotes, and underscores; reject repeated minus signs and signed compound heights. Ignore unrelated dates and prose dashes, and retain independent measurements after invalid or zero-height fragments. Preserve semicolons as punctuation within individual measurements. Support metric suffixes and unit-prefix values after unrelated zeroes. Bound matching work for malformed decimal shorthand.
