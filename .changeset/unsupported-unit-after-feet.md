---
'@afahy/fluent-measures': patch
---

After a feet part, a number with a stone, ounce or gram unit no longer becomes inches. So "5 ft 8 oz" returns 5 ft, not 68 in, and "0 ft 8 oz" returns `null`, not 8 in.
