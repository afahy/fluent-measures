---
'@afahy/fluent-measures': patch
---

The parser removes the periods at the end of each token, and the semicolons before a unit, in linear time. Before, it used a regex that took quadratic time on a long run of these marks. So 100,000 periods before a letter, as in `'.'.repeat(100000) + 'a'`, took about 2.6 seconds and blocked the event loop. Each result stays the same.
