---
'@navecss/core': patch
---

The README now explains why `@nave` copies an atom's declarations into every rule that uses it, what that costs after compression, what reduces it (brotli at level 11, CSS split by route), and why Nave does not merge the copies or ship atoms as shared classes. Only the README changes; no code or behaviour does.
