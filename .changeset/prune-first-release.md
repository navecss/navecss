---
'@navecss/prune': minor
---

First release. `@navecss/prune` ships only the atoms a Next.js build can read a use for. List
`@navecss/prune/postcss` in your PostCSS config and wrap your Next.js config in `withNave()`, and
the atom layer keeps the rules for the atoms your `cx()` calls name, for the atom of each `nave-*`
class written as text, and for the atoms in `keep` and `keepFor`. A `cx()` call whose atoms the
build cannot read fails `next build` with a report that says how to fix it. It needs Next.js 16.2.0
or later, on Turbopack or webpack. It is released at the same version as `@navecss/core`: upgrade
the two together.

This corrects an earlier `@navecss/core` release note, which said the PostCSS plugin ships every
atom on Next.js. `@navecss/core/postcss` still ships every atom, on Next.js and webpack alike; on
Next.js, `@navecss/prune` is how you ship only the atoms in use. On Vite you do not need it:
`navePlugin()` from `@navecss/core/vite` already does this.
