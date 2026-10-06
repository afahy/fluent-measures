---
'@afahy/fluent-measures': patch
---

Read curly quotes, primes and acute accents as feet and inch marks, so "5’11”", "5′11″" and "5´11´´" return 71 in instead of null. Full-width characters and the units "㎝" and "㎏" are read as their ASCII forms, so "１８０ｃｍ" and "180 ㎝" return 180 cm. An apostrophe in prose, curly or not, is still an apostrophe.
