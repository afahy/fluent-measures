---
'@afahy/fluent-measures': minor
---

Narrow the unit of each part in `ParsedValue.matches` to `Unit`, since matches always have a
unit. The top-level `ParsedValue.unit` remains `Unit | null`. Parser results are unchanged.
