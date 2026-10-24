---
'@navecss/core': patch
---

The README and the agent guide now point Next.js projects to `@navecss/prune`, which ships only the atoms a Next.js build can read a use for, and the guide says never to move a Next.js project back to `@navecss/core/postcss`, or to remove `withNave()`, to make a report go away. `@navecss/core/postcss` itself is unchanged and still ships every atom.
