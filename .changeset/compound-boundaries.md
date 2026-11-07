---
'@afahy/fluent-measures': minor
---

Keep height parts separate when semicolons or ordinary words other than "and" stand between
them. Inputs such as "5 ft tall, with 2 in heels" now return null instead of adding unrelated
heights together.
