---
'@afahy/fluent-measures': patch
---

Preserve explicit zero components and leading-dot decimals in hyphenated heights, and support meter normalization. Reject numeric ranges before or after their unit, including spaces and Unicode dashes. Preserve signs after exact or fuzzy unit prefixes, opening quotes, and underscores; reject repeated minus signs and signed compound heights. Ignore unrelated dates and prose dashes, and retain normalized weights after invalid height fragments. Bound matching work for malformed decimal shorthand.
