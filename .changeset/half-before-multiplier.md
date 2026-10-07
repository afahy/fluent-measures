---
'@afahy/fluent-measures': patch
---

When the unit comes after the number, a multiplier word after "and a half" now multiplies the whole number plus 0.5. So "two and a half thousand pounds" returns 2500 lb, not 1000 lb. "Five and a half hundred pounds" returns 550 lb, and "two and a half hundred thousand pounds" returns 250,000 lb. A semicolon between the half and its unit works too, as in "two and a half thousand; lbs" and "6 and a half; ft". If the words before "half" don't form a number, as in "1.5 and a half thousand lbs", the result is now null, not 1000 lb. A unit or label before the number still reads only the half, so "pounds: two and a half thousand" returns 2.5 lb.
