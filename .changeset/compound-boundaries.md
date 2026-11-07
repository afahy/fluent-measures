---
'@afahy/fluent-measures': minor
---

Keep height parts separate when semicolons or ordinary words other than "and" stand between
them. Inputs such as "5 ft tall, with 2 in heels" now return null instead of adding unrelated
heights together.
Unicode words now keep those parts apart too. Letters attached to a number or unit are no
longer discarded to expose a measurement, so inputs such as "5µm" no longer mean 5 meters.
