---
'@navecss/core': patch
---

Fix `@nave` in the Vite plugin, the Lightning CSS adapter and `navecss-core expand` when the
input ends before a rule closes and its last token is a comment or a backslash. The expander now
closes what the input left open (a nested rule, a function, the last declaration) ahead of the
comment, and keeps a trailing backslash from escaping what it writes after it, so the blocks the
atoms add are no longer swallowed by what the input left open.
