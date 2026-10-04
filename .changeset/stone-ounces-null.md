---
'@afahy/fluent-measures': patch
---

Return null for a weight with a part in stone, ounces or grams, such as "12st 4lb", "7 lb 8 oz" and "3 kg 400 g", instead of returning the supported part alone. These units aren't supported. "st" after a number that ends in 1, except 11, is read as an ordinal, so dates such as "Oct 1st" still work. A height in the same input is still returned.
