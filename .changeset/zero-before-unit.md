---
'@afahy/fluent-measures': patch
---

A zero right before a unit is now that unit's own number. Before, the unit also took the next number, so "0 cm, 1.8 m" returned 1.8 cm. Now the unit doesn't take a number that has its own unit, so "0 cm, 1.8 m" returns 1.8 m and "0 kg, 80 lb" returns 80 lb. A number with no unit of its own still belongs to the unit before it, as in "record 0; kg 70" and "0 kg 70".
