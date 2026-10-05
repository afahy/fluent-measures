---
'@afahy/fluent-measures': patch
---

Return null for a weight with a part in stone, ounces or grams when a unit comes before its number, as in "stone 12, 4 lb", "kg 3, 400 g" and "Stone: 12, lb: 4", instead of returning the supported part alone. "gravel and stone, 50 lb bag" still returns 50 lb, because 50 has its own unit. Like "in" and "m", "st" and "g" before a number are read as other words, so "Main St 12, 180 lbs" still returns 180 lb.
