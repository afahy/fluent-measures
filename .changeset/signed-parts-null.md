---
'@afahy/fluent-measures': patch
---

A measurement can't be negative. Before, the parser dropped a signed part, such as "-5 ft" or "kg -5", and the rest of the input decided the result.

Now each part in a field with a signed part is dropped for its type. A field is the input, or a part between semicolons. So "-5 ft 6 ft", "[-5 kg] 70 kg" and "-12st 4lb" return null, and so does "−5 ft 6 ft" with the Unicode minus sign.

After a number and its unit, a hyphen now joins two parts or values. So "150 lbs-180 lbs" returns null, as a range that repeats its unit, and "1 m-80 cm" returns 180 cm.

A signed height doesn't cancel a weight, so "-5 ft, 150 lbs" returns 150 lb.
