---
'@afahy/fluent-measures': patch
---

A multiplier word after "and a half" now multiplies the whole number plus 0.5. So "two and a half thousand pounds" returns 2500 lb, not 1000 lb, and "five and a half hundred pounds" returns 550 lb. A semicolon between the half and its unit works too, as in "two and a half thousand; lbs" and "6 and a half; ft".
