---
'@navecss/core': patch
---

Fix `@nave` in the Vite plugin, the Lightning CSS adapter and `navecss-core expand` when the
last declaration in a rule has no semicolon. The first pseudo-class, `@media` or `@container`
block the atoms add at the end of the rule was written into that declaration's value, so the
declaration and the block were both invalid and dropped: in `.button { @nave focusRing; color: red }`,
`color` was lost and the button had no outline under keyboard focus. The PostCSS plugin, and Vite
with `css.transformer: 'lightningcss'`, were not affected.
