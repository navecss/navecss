---
'@navecss/core': patch
---

`cx.dynamic()` also reads its map of kept atoms when a bundler inlines it as a JSON string, as
Next.js's `compiler.define` does. A Vite build with `navePlugin()`'s default is unchanged: the
bundler drops the new branch. A bundle with no map (no plugin, or `atomic: 'all'`) gains the few
bytes that read the string.
