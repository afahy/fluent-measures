---
'@afahy/fluent-measures': patch
---

Return null for a weight with a part in stone, ounces or grams, such as "12st 4lb", "7 lb 8 oz" and "3 kg 400 g", instead of returning the supported part alone. These units aren't supported. Only a part next to a supported weight part counts, so an unrelated amount such as "I drink 8 oz of water, weight 180 lbs" still returns 180 lb. Commas don't separate parts, so "180 lbs, 8 oz of water a day" returns null. "st" after a whole number that ends in 1, except 11, is read as an ordinal, so dates such as "Oct 1st" still work, while "10.1st 4lb" returns null. A capital "G" right after a number, as in "5G", isn't read as grams. A height in the same input is still returned.
