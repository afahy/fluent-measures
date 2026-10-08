---
'@afahy/fluent-measures': patch
---

Two apostrophes right after a digit now read as an inch mark, as `"` does there. So `72''` returns 72 in, not `null`. `´´` and `’’` read the same way. Two apostrophes that close a number they opened, as in `the ''5'' kg bag`, and three or more marks, as in `72'''`, still return `null`.
