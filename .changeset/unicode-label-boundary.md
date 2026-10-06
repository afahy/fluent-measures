---
'@afahy/fluent-measures': patch
---

Don't read the short unit forms "in" and "m" as a label when they end a longer word that starts with a non-ASCII letter, so "µm: 5" (micrometers) and "éin: 72" return null instead of 5 m and 72 in. Labels after a space or bracket, such as "Height in: 72" and "Longueur (m): 1.8", still work.
