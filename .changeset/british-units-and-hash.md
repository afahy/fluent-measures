---
'@afahy/fluent-measures': patch
---

The British spellings "centimetre", "centimetres", "metre" and "metres" are now units, so "170 centimetres" returns 170 cm and "1.8 metres" returns 1.8 m. "#" right after a number now means pounds, so "185#" returns 185 lb. "#" before a number still isn't a unit, as in "room #12". The new spellings match only exactly, so fuzzy matching reads no new word as a unit.

<!-- cspell:ignore centimetre centimetres -->
