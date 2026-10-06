---
'@afahy/fluent-measures': patch
---

Read the Unicode minus sign "−" (U+2212) and the small hyphen-minus "﹣" (U+FE63) right before a number as "-". A measurement can't be negative, so "−5 ft" and "−½ lb" now return null, as "-5 ft" does, instead of 5 ft and 0.5 lb. "kg−70.5" returns null, as "kg-70.5" does. A minus sign right after a digit, as in "5−11", or with a space after it, as in "Height − 180 cm", is still a dash.
