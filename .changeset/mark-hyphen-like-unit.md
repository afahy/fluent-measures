---
'@afahy/fluent-measures': patch
---

A hyphen after a feet or inch mark now joins two values as it does after a unit word. So `5'-eleven` returns 71 in and `5;"-5 in` returns 5 in, and the hyphen in `x11"-5 in` is a minus sign, as in `x11 in-5 in`.
