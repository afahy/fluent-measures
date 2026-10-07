---
'@afahy/fluent-measures': patch
---

Parsing a long run of periods or semicolons now takes linear time. Before, the parser removed the periods at the end of each token, and the semicolons before a unit, with a regex that took quadratic time. So an input of 100,000 periods before a letter, such as `'.'.repeat(100000) + 'a'`, took about 2.6 seconds, and untrusted text could block the event loop. Each result stays the same.
