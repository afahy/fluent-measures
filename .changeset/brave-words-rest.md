---
'@afahy/fluent-measures': patch
---

Stop reading the short unit forms "in" and "m" before a number, where they're usually ordinary words, so "weighed 70 kg in 2020" returns 70 kg instead of 2020 in, and "M 28" returns null instead of 28 m. Labels still work before their number, as in "Height (in): 72", "in: 72", "in. 5" and "m: 1.8", unless the number has its own unit, as in "weigh-in: 180 lbs". "in" and "m" after a number are unchanged. Without a label, inputs such as "in 72" and "height in 72" now return null.
