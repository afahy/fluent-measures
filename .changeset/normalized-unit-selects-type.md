---
'@afahy/fluent-measures': patch
---

`normalizedUnit` now selects the measurement type, so `parseMeasurement` no longer throws when the input has a measurement of the other type. "6 ft" with `{ normalizedUnit: 'kg' }` returns null, and "6 ft, 80 kg" with `{ normalizedUnit: 'kg' }` returns 80 kg. A `type` that contradicts `normalizedUnit`, as in `{ type: 'height', normalizedUnit: 'kg' }`, throws "normalizedUnit kg is not a height unit" for any input except an empty one or one of only punctuation, as `allowUnqualified` without `type` does. Bare shorthand such as "5-11", and `allowUnqualified`, still need `type`. A height with several parts now keeps the unit system of its parts: "1 m 80 cm" returns 180 cm instead of 70.87 in. "5 ft 11 in" still returns 71 in.
