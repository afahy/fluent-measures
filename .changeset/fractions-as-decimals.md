---
'@afahy/fluent-measures': patch
---

Read a fraction as part of its number, so "150 1/2 lbs" returns 150.5 lb instead of 2 lb, and "5½ ft" returns 5.5 ft instead of 5 ft. A whole number followed by a space and a proper fraction (`a/b` with `a` less than `b`), and a Unicode fraction such as "½", "¼" or "⅛" after a number, are read as one number. A slash between numbers that don't make a proper fraction, as in "5/2 lbs" and "150 5/2 lbs", now returns null instead of 2 lb. A date such as "12/25/2020" is still ignored.
