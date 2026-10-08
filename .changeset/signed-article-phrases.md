---
'@afahy/fluent-measures': patch
---

A minus sign on "a" or "an" before number words now signs the number. So `-a hundred kg` and `age 28 kg: -a hundred` return `null`, as `-one hundred kg` does. The parser also reads a signed number in words before an ounce, gram or stone unit as one number. So `12 lb -twenty five oz` returns `null`, as `12 lb -25 oz` does.
