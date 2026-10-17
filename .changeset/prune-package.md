---
'@navecss/prune': minor
---

Adds `@navecss/prune`, a PostCSS plugin and a `withNave()` wrapper for Next.js that keep only the atoms a build reads a use of. The plugin follows the import graph from Next.js's route files, reads every `cx()` call and written `nave-*` class with the same reader as the Vite plugin, and trims the `@layer atomic` block to whole atoms (an atom that restores another, `srOnlyFocusable` for `srOnly`, comes with it). `withNave()` takes `keep`, `keepFor`, `cxModules`, `extend` and `onUnknown`, gives `cx.dynamic()` its map as JSON text, and adds `@navecss/core` to `transpilePackages`. `@navecss/core/postcss` is unchanged and still ships every atom.
