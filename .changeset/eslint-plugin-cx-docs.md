---
'@navecss/core': patch
---

Updates the `cx()` documentation (the README's "Escape hatch" section and `cx.ts`'s own docblock) to name `@navecss/eslint-plugin`, which now checks the rest of the `className` attribute — a bare string sitting beside `cx()`/`cx.raw()` is no longer unchecked once that plugin is installed. No runtime behaviour changes.
