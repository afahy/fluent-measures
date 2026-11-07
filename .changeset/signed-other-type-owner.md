---
'@afahy/fluent-measures': minor
---

Keep an independent measurement when an unmarked unit prefix precedes a signed value with its own other-type unit, such as `kg -6 ft, 70 kg` (70 kg). Retained measurements now participate in agreement checks, so `70 kg; kg -6 ft, 80 kg` correctly returns `null` instead of 70 kg.
