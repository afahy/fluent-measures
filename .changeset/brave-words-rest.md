---
'@afahy/fluent-measures': patch
---

Stop reading the short unit forms "in" and "m" before a number, where they're usually ordinary words, so "weighed 70 kg in 2020" returns 70 kg instead of 2020 in, and "M 28" returns null instead of 28 m. Labels still work before their number: in brackets, before ":" or "=", or written "in.", as in "Height (in): 72", "in = 72" and "m: 1.8". A label doesn't take a number that has its own unit, as in "Weigh in: 180 lbs", unless that unit starts the next part of the height, as in "m: 1 cm: 80". The end of a hyphenated word such as "check-in" is never a label. "in" and "m" after a number are unchanged. Without a label, inputs such as "in 72" and "height in 72" now return null.
