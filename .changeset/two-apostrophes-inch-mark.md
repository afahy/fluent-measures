---
'@afahy/fluent-measures': patch
---

Two apostrophes right after a digit now read as an inch mark, as `"` does there. So `72''` returns 72 in, not `null`. `´´` and `’’` read the same way.
