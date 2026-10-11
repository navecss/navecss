---
'@navecss/core': minor
---

New: `@navecss/core/vite`, a Vite plugin for the `@nave` directive. Add `navePlugin()` from it to
`plugins`, with the same `extend` and `onUnknown` options as the PostCSS plugin. It returns two Vite plugins in
an array, which `plugins` takes as one entry. It has no dependency and no peer, it needs no PostCSS,
and it adds no code to the browser bundle. It expands `@nave` after Vite's own CSS step has run, so a stylesheet reached only through
`@import`, a Sass file (a `@mixin` that holds a directive included), a CSS Module, an `?inline` or
`?url` import, and a Vue or Svelte style block are all covered, in `vite build` and in the dev
server, under either `css.transformer`. Under `css.transformer: 'lightningcss'` it also drops
Lightning CSS's `Unknown at rule: @nave` warning, and only that warning, by wrapping the logger
Vite resolved.

The build is checked at its end. The plugin reads the CSS files the build wrote and fails the build
if a `@nave` directive is left in one, printing the lines `navecss-core check` prints for the same
content. There is no option to turn that off. The dev server serves no bundle, so dev has no scan;
CSS that ends inside a JavaScript string (`?inline`), files copied from `public/`, and a CSS file
another plugin adds after the scan (from a post-ordered `generateBundle` in a plugin listed after
`navePlugin()`, or from `writeBundle`) are not scanned.

Passing `extend` as a path to a module now works with Vite's own watching: edit the module and the
dev server serves the new value with no restart, and `vite build --watch` rebuilds.

To migrate a project that already runs the PostCSS plugin on Vite: move `navePlugin()` from
`css.postcss` or `postcss.config.js` to `plugins`, importing it from `@navecss/core/vite`. Leaving
both is harmless, because whichever pass runs second finds no directive left. Moving also changes
which atoms ship, as another entry in this release describes. Webpack and any other pipeline that
runs PostCSS plugins keep using `@navecss/core/postcss`, and so can Next.js. The plugin sets no browser
floor of its own: `build.cssTarget` (and, under Lightning CSS, `css.lightningcss.targets`) stay
yours, and the package README shows both at the floor.

`@navecss/core/vite` also has a default export, for tools that load it that way.
