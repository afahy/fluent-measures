---
'@afahy/fluent-measures': minor
---

Remove fuzzy unit matching and the `fuzziness` option. Unit names must now be exact:
`5 foots 10 inc` returns `null`, and `5 foot 10 inches` returns 70 in. `kilogramme` and
`kilogrammes` are new aliases for kilograms.

Remove `fuzziness` from your options. Any defined value now throws, including `0`, `false` and
`Infinity`. An `undefined` value is treated as absent. The parser doesn't suggest corrections or
change numbers, so ask the user to fix the entry and submit it again. The result shape is
unchanged.
