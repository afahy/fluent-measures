---
'@afahy/fluent-measures': patch
---

Pass typed tokens from the tokenizer to the parser. A label is one token that gives its kind and whether it starts a field, and the parser sets a flag on each token that a measurement uses. No result changes, except for input that contains the words `_unit`, `_name` or `_field`. The parser no longer reads them as label marks, so `5 _unit kg` returns null, not 5 kg.
