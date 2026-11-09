---
'@afahy/fluent-measures': minor
---

Replace the `fuzziness` option with `fuzzy: true`, which reads a unit name with one spelling
error, as in `parseMeasurement('5 foots 10 inc', { fuzzy: true })` → 70 in. With `fuzzy: true`,
an ordinary word one letter from a unit name also reads as that unit, as in `5 feat` → 5 ft and
`70 kiln` → 70 kg. A unit name with two errors returns `null`, except for the reviewed typos in
PARSING.md, such as `kilgrm`. `fuzzy` must be `true` or `false`.

`fuzziness` is retired: any defined value throws a migration error. Replace `fuzziness: 1` or
`2` with `fuzzy: true`, and remove `fuzziness: 0`.

`kilogramme` and `kilogrammes` are new exact aliases for kilograms.
