---
'@afahy/fluent-measures': patch
---

Read the whole number phrase after a unit, so "kg one hundred eighty" returns 180 kg instead of 1 kg, and "in: seventy two" returns 72 in instead of 70 in. A label still doesn't take a number that has its own unit, so "Weigh in: one hundred eighty lbs" returns 180 lb.
