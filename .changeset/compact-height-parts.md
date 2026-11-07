---
'@afahy/fluent-measures': minor
---

Read compact heights such as `5ft11` and `1m80`, and accept `kgs` and `cms`.
Include bare centimeters after meters: `1 m 80` and `one meter eighty` now return
180 cm instead of dropping the smaller part and returning 1 m.

A zero-meter larger part also uses centimeters for its bare smaller part. Such a part
must be below 100; `0 meter 100` now returns `null` instead of treating 100 as meters.
