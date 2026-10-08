---
'@afahy/fluent-measures': patch
---

Fix more signed parts. A signed value with its own unit of the other type no longer drops a label's measurement, so `in: -180 lbs, 72 in` returns 72 in. A semicolon before the number no longer stops a hyphen from joining two values, so `1 ; m-80 cm` returns 180 cm. A sign on the first word of a number in words now signs the whole number, so `-twenty five kg` returns `null`, as `-5 feet` does.
