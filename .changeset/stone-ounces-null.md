---
'@afahy/fluent-measures': patch
---

Return null for a weight with a part in stone, ounces or grams, such as "12st 4lb", "7 lb 8 oz" and "3 kg 400 g", instead of returning the supported part alone. These units aren't supported. Only a part next to a supported weight part counts, so an unrelated amount such as "I drink 8 oz of water, weight 180 lbs" still returns 180 lb. "st" after a number that ends in 1, except 11, is read as an ordinal, so dates such as "Oct 1st" still work. A height in the same input is still returned.
