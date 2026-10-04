---
'@afahy/fluent-measures': patch
---

Stop reading the word "in" as inches when it comes before a number, so text such as "weighed 70 kg in 2020" returns 70 kg instead of 2020 in. "in" after a number, as in "5 ft 11 in", is still inches.
