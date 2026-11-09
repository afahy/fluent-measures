---
'@afahy/fluent-measures': minor
---

Replace the `fuzziness` option with `fuzzy: true`, which reads a unit name with one spelling
error, as in `parseMeasurement('5 foots 10 inc', { fuzzy: true })` → 70 in. A unit name with
two errors, such as `70 kilgrm`, now returns `null`. Common English words that are one error from
a unit name, such as `fees`, `kiln` and `meteor`, never match; PARSING.md lists them. `fuzzy`
must be `true` or `false`.

`fuzziness` is retired: any defined value throws a migration error. Replace `fuzziness: 1` or
`2` with `fuzzy: true`, and remove `fuzziness: 0`.

`kilogramme` and `kilogrammes` are new exact aliases for kilograms.
