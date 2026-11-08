---
'@afahy/fluent-measures': minor
---

Replace `allowUnqualified` and `inferUnit` with `defaultUnit`, the explicit source unit for a
complete bare number. Written units take precedence; `normalizedUnit` only selects the result
unit and dimension. Remove implicit imperial defaults and metric-height magnitude guessing.

Migrate imperial height/weight fields to `defaultUnit: 'in'`/`'lb'`, metric weight to `'kg'`, and
choose `'m'` or `'cm'` explicitly for metric height. Defined retired options now throw a migration
error. Options are validated before string length/content, including empty or overlong strings;
non-string runtime input still returns `null` without inspecting options.
