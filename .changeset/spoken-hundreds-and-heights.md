---
'@afahy/fluent-measures': patch
---

Read spoken weights and heights. A ones word and then a tens word, as the first two words of a number, are hundreds, so "one-eighty pounds" returns 180 lb instead of 80 lb, and "two twenty-five lbs" returns 225 lb. Two number words joined by a hyphen work like the "5-11" shorthand when the feet are 3 to 8, so "five-eleven" with `{ type: 'height' }` returns 71 in instead of null. Without `{ type: 'height' }`, "five-eleven" still returns null, as "5-11" does.
