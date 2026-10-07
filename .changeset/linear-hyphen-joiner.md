---
'@afahy/fluent-measures': patch
---

A long token with many words before a hyphen and a digit, such as `';kg-1'.repeat(25000)` or `';a-1'.repeat(25000)`, now parses in linear time. Before, at each such word, the parser read back over the whole token before it, so 25,000 copies of ";kg-1" took about a second. Each result stays the same.
