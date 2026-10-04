---
'@navecss/core': minor
---

`@nave` now has two more routes, for hosts that run Lightning CSS directly and for projects with no
bundler, and Nave ships its whole stylesheet as one file. Nothing that built before changes: the
export map only grows, and `@navecss/core` still has no dependency and no new peer.

- New `@navecss/core/lightningcss`: `navePlugin()` returns `{ expand, resolver }`. `expand(code,
filename)` expands the directives in a stylesheet's text and returns `{ code, map }` to pass to
  Lightning CSS's `transform()` as `code` and `inputSourceMap`; `resolver.read` does the same for
  each file `bundleAsync()` asks for, so a file reached through `@import` is covered. Lightning CSS
  never sees a directive, so it prints no `Unknown at rule` warning and cannot fail on a malformed
  one; Nave's own messages name the real file, line and column. The adapter imports nothing from
  `lightningcss` and declares no peer: bring your own copy, version 1.22 or later (1.20 cannot parse
  nested output). It takes `extend` (an object) and `onUnknown`, as the other plugins do. It is for
  a host that runs Lightning CSS itself, not for Vite: on Vite, keep using the Vite plugin.
- New `navecss-core expand --source=<file> --out=<file>`, with `--extend=<module>` and `--watch`:
  expands every `@nave` in each source and writes it, reporting every problem across every file in
  one run. `--source` and `--out` repeat as pairs, matched by order. Exit `0` when every file was
  written, `1` when a stylesheet had a problem (and nothing is written), `2` for a usage error or a
  source that could not be read. It does not resolve or inline `@import`; an import of a package
  (`@import url('@navecss/core')`) is reported as an error, because a browser cannot load it.
- New `@navecss/core/standalone`, the file `dist/standalone.css`: the layer order statement, then
  the token layer, the reset and the atoms, each in its own layer as before, with no `@import` in
  it. A page with no bundler links it instead of importing Nave from its CSS, by path or from a CDN,
  before the stylesheet `navecss-core expand` wrote. Both names are fixed from this release: a
  `link` element pointing into `node_modules` bypasses `exports`, so the file path is as much part of
  the public surface as the subpath.
- `@navecss/core/lightningcss` also has a default export, as the PostCSS and Vite plugins do. The named
  `navePlugin` is the documented form.

See "Without a bundler" in the repository README and the Lightning CSS adapter and `navecss-core
expand` sections of the package README.
