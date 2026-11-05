---
'@afahy/fluent-measures': minor
---

Return null for non-string input at runtime and for raw input longer than 1,000 characters.
Add the `maxLength` parsing option to raise or lower this limit, or disable it with `Infinity`.
Invalid limits throw an error. The TypeScript input parameter remains `string`.
