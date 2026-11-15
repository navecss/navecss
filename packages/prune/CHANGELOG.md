# @navecss/prune

## 0.6.0

### Minor Changes

- 2d3ca21: First release. `@navecss/prune` ships only the atoms a Next.js build can read a use for. List
  `@navecss/prune/postcss` in your PostCSS config and wrap your Next.js config in `withNave()`: the
  plugin reads the `cx()` calls in the modules your entry files import, dependencies included, and
  the atom layer keeps the rules for the atoms those calls name, for the atom of each `nave-*` class
  written as text in those modules, and for the atoms in `keep` and `keepFor`. A `cx()` call whose
  atoms the build cannot read fails `next build` with a report that says how to fix it. A `nave-*`
  class the build cannot see, such as one in CMS text or one a package listed in `keepFor` applies at
  run time, has a rule only while its atom ships for another reason: a use the build reads elsewhere,
  `keep`, or a `keepFor` entry. List the atom in `keep` or in a `keepFor` entry if the class must keep
  its rule when other code changes. The package README's "What it cannot see" lists what the build
  does not read. It needs Next.js 16.2.0 or later, on Turbopack or webpack. It is released at the
  same version as `@navecss/core`: upgrade the two together.

  This corrects an earlier `@navecss/core` release note, which said the PostCSS plugin ships every
  atom on Next.js. `@navecss/core/postcss` still ships every atom, on Next.js and webpack alike; on
  Next.js, `@navecss/prune` is how you ship only the atoms the build can read a use for. On Vite you
  do not need it: `navePlugin()` from `@navecss/core/vite` already does this.

### Patch Changes

- Updated dependencies [66ff926]
- Updated dependencies [c1a4dfb]
- Updated dependencies [e1b0dd4]
- Updated dependencies [66ff926]
- Updated dependencies [fad9195]
  - @navecss/core@0.6.0
