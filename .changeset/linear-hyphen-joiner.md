---
'@afahy/fluent-measures': patch
---

A long token with many unit words before hyphens, such as `';kg-1'.repeat(25000)`, now parses in linear time. Before, at each unit word, the parser read back over the whole token before it, so 25,000 copies of ";kg-1" took about a second. Each result stays the same.
