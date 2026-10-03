---
'@navecss/core': minor
---

The Vite plugin ships only the atoms its build can read a use for. `navePlugin()` from
`@navecss/core/vite` reads every `cx()` call the build compiles, dependencies included, and the
atom layer keeps the rules for the atoms those calls name and no others; a Nave class written as
text, in a module or in `index.html`, keeps its atom too. A `cx()` call whose atoms the build
cannot read fails the build: `vite build` lists every such use once, at the end, with its file,
line and column and how to fix it. A Nave class built from pieces (`'nave-' + tone`) fails the
build the same way. Next.js, webpack and the PostCSS plugin ship every atom, as before.

New: `cx.dynamic(name)` on `@navecss/core/cx`, for a name known only at run time. Under the Vite
plugin it applies a class only for an atom listed in `keep`; anywhere else it maps like `cx()`,
except that a name that is no atom returns `''` where `cx()` returns it unchanged.

New Vite plugin options: `keep`, the atoms always shipped; `keepFor`, by package name, the atoms a
dependency's calls can produce, for a package whose calls the build cannot read; and
`atomic: 'all'`, which reads no `cx()` call and ships every atom.
