---
'@afahy/fluent-measures': patch
---

Stop adding separate measurements together. Parts form one measurement only when each unit is the next smaller one and the smaller part is less than one of the larger unit, as in "5 ft 11 in" or "1 m 80 cm". When an input has more than one measurement of a type, return the first if the others agree with it within 1%, so "70 kg (154 lbs)" returns 70 kg instead of 139.85 kg, and "6 ft (72 in)" returns 6 ft instead of 144 in. Otherwise return null, so "210 lbs to 180 lbs" and "150 lbs - 180 lbs" no longer return 390 lb and 330 lb. "5 ft-1 m" and "5 ft 12 in" also return null now, instead of 2.524 m and 72 in.
