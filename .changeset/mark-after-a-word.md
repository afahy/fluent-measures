---
'@afahy/fluent-measures': patch
---

A feet or inch mark right after "half" or a number word now reads as a mark, as it does after digits. So `5' 10 and a half"` returns 70.5 in, not 70 in, `five' ten"` returns 70 in, not `null`, and `six'` returns 6 ft.
