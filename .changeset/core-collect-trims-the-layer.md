---
'@navecss/core': minor
---

Adds `pruneAtomicLayer()`, `inspectAtomicLayer()`, `unprunedAtoms()` and `withRestorers()` to the `@navecss/core/collect` subpath. A build tool that is not the Vite plugin can now trim the `@layer atomic` block to whole atoms (a set holding `srOnly` also holds `srOnlyFocusable`) the way `navePlugin()` from `@navecss/core/vite` does, without a copy of the trimming code. Like the rest of the subpath it is not meant for application code, and nothing the Vite plugin does changes.
