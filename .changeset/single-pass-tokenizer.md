---
'@afahy/fluent-measures': patch
---

Read every number form in one scan of the tokenizer, not in separate regex passes. One function reads digits, decimals, comma groups, fractions and mixed numbers, and each token stores the minus signs at its start and the role of a hyphen that the scan removed before it. No result changes.
