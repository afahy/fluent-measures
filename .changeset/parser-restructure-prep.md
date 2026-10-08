---
'@afahy/fluent-measures': patch
---

Prepare the parser restructure with no change to any result. A result snapshot of generated inputs shows each result that a later change changes. The unused `parseNumberToken` module is gone, one function normalizes text for `tokenize` and `parseMeasurement`, and two blocks of `parseMeasurement` are now named functions.
