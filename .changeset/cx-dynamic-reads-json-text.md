---
'@navecss/core': patch
---

`cx.dynamic()` also reads its map of kept atoms when a bundler inlines it as a JSON string, as
Next.js's `compiler.define` does. On Vite nothing changes in behaviour or in the CSS; the client
bundle gains the few bytes that read the string.
