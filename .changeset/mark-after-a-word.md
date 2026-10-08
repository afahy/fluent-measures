---
'@afahy/fluent-measures': patch
---

A `'` or `"` mark, or a prime, right after "and a half" or a number word now reads as a feet or inch mark, as it does after digits. So `5' 10 and a half"` returns 70.5 in, not 70 in, `five' ten"` returns 70 in, not `null`, and `six'` returns 6 ft. A quoted word, as in `"ten" 5`, is still not a measurement.
