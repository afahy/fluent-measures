---
'@afahy/fluent-measures': patch
---

"and a half" after a whole number now adds 0.5, for digits and number words. So "six and a half feet" returns 6.5 ft and "1 and a half meters" returns 1.5 m, where both returned null before. After a feet part with no inch unit, the half belongs to the inches. So "5 foot 10 and a half" returns 70.5 in, not 70 in. An input with only a number and no unit, read with `allowUnqualified`, doesn't read "and a half" yet.
