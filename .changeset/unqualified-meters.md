---
'@afahy/fluent-measures': patch
---

With `{ type: 'height', allowUnqualified: true, inferUnit: 'metric' }`, a lone number below 3 is now a height in meters, because no one is 3 cm tall. So "1.75" returns 1.75 m, not 1.75 cm, and returns 175 cm with `normalizedUnit: 'cm'`. From 3 up, a lone number stays centimeters, as in "175" → 175 cm.
