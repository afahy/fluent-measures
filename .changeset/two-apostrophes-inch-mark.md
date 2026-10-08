---
'@afahy/fluent-measures': patch
---

Two apostrophes right after a number now read as an inch mark, as `"` does. So `72''` returns 72 in, not `null`. `´´` and `’’` read the same way.
