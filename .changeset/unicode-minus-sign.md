---
'@afahy/fluent-measures': patch
---

Read the Unicode minus signs "−" (U+2212) and "﹣" (U+FE63) before the first number of an input as "-". A measurement can't be negative, so "−5 ft" and "−½ lb" now return null, as "-5 ft" does, instead of 5 ft and 0.5 lb. "kg−70.5" returns null, as "kg-70.5" does. After a number, a minus sign still joins two parts or values, so "5−11", "1 m−80 cm" and "150 lbs−180 lbs" give the same results as before.
