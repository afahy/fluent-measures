---
'@afahy/fluent-measures': minor
---

Require a complete height or weight entry, with finite ordinary wrappers and directional
labels. Reject ranges, duplicate readings, unrelated prose, signed/malformed fragments, and
partial recovery. A height/weight pair now needs a selector and both expressions must be valid.
Read complete number phrases in either unit position and retain written zero compound parts.
There is no legacy parsing mode; callers should submit one field value or a complete selected pair.
