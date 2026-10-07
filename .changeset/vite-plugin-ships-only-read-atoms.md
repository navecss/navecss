---
'@navecss/core': minor
---

The Vite plugin ships only the atoms its build can read a use for, in the CSS files of a client
build. `navePlugin()` from `@navecss/core/vite` reads the `cx()` calls in the code the build
compiles, dependencies included, and in those files the atom layer keeps the rules for the atoms the
calls name, for the atom of each Nave class written as text (in a module or in `index.html`) and for
the atoms in `keep` and `keepFor`. It keeps no others, with two exceptions: `srOnlyFocusable` is
kept whenever `srOnly` is, and the client build also keeps the atoms that a separate server build
(`vite build --ssr`) recorded in the cache directory. A stylesheet imported with `?inline` or `?raw`
becomes text in the JavaScript, which the plugin does not filter: if it holds the atom layer, every
atom in it ships and the client build warns, naming the file. A `cx()` call whose atoms the build
cannot read fails the build: `vite build` lists every such use once, at the end, naming the file
each one is in, then says how to fix them. A Nave class built from pieces (`'nave-' + tone`) fails
the build the same way. Next.js, webpack and the PostCSS plugin ship every atom.

The dev server serves the same set as far as it has read: it filters the atom layer of each
stylesheet to the atoms of the modules it has transformed, so a class the build cannot see has no
rule in dev either. The first stylesheet response waits until every module reachable from the page's
entries has been read, and the stylesheet reloads when an edit adds an atom. `@navecss/core` is left
out of the dependency pre-bundle so a dependency's `cx()` calls are read, and a build or dev server
that read no use and no markup (a backend rendering its own templates) warns once.

New: `cx.dynamic(name)` on `@navecss/core/cx`, for a name known only at run time. In the dev server
and in code that `vite build` bundles under the Vite plugin, it returns a class only for an atom
listed in `keep` or in a `keepFor` list, unless `atomic` is `'all'`; in dev a name outside the list
also prints a line to the console. Under `atomic: 'all'`, and without the plugin, it
maps like `cx()`, except that a name that is no atom returns `''` where `cx()` returns it
unchanged.

New Vite plugin options: `keep`, the atoms always shipped; `keepFor`, by package name, the atoms a
dependency's calls can produce, for a package whose calls the build cannot read; and
`atomic: 'all'`, which reads no `cx()` call and ships every atom.
