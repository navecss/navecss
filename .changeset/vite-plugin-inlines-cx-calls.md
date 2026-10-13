---
'@navecss/core': minor
---

In a build, the Vite plugin turns each `cx()` call it read into the class string the call returns,
so the map from atom names to classes is not in your bundle. `cx('flex', 'grid')` becomes
`"nave-flex nave-grid"`, and a call with a condition keeps its arguments where they are, with each
atom name replaced by its class and the result joined as `cx.raw()` joins, so every argument is
evaluated once, in the order you wrote it. A direct `cx.raw()` call becomes the same join, and a
direct `cx.dynamic()` call a lookup in a map of the atoms in `keep` and `keepFor`. The dev server
keeps the run-time functions, which return the same strings, and `atomic: 'all'` rewrites nothing.

A bundle in which every use of `cx` is one of those direct calls, and no module that imports `cx`
calls `eval` directly, holds neither the name map nor the atoms' declarations. Two forms keep the
map, because the build cannot follow the alias: `const r = cx.raw` and `const { raw } = cx`. So
does a package listed in `keepFor` whose calls the build cannot read, because those calls stay
calls to the run-time `cx()`. A module that calls `eval` directly keeps its import of `cx`, and
with it the map, whatever text it runs (`eval('1')` too), because that text can read the module's
names and the build cannot read the text. An indirect call, `(0, eval)(text)` or
`globalThis.eval(text)`, runs its text in the global scope, where `cx` is not visible, and does
not keep the import. Each rewritten module returns a source map.
