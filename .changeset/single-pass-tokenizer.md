---
'@afahy/fluent-measures': patch
---

The tokenizer reads the input in one scan from left to right, in place of separate passes for
character forms, comma groups and fractions. Every result stays the same. The bundle is about
1.2 kB larger.
