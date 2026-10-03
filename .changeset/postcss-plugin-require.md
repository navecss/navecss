---
'@navecss/core': patch
---

`@navecss/core/postcss` now loads through `require()` as well as `import`, so a CommonJS `postcss.config.js` can use the plugin. It also loads when a host reads the plugin by its package name, which is the form Next.js's webpack pipeline accepts: `plugins: { '@navecss/core/postcss': {} }`. Before, both failed (`ERR_PACKAGE_PATH_NOT_EXPORTED`, or `An unknown PostCSS plugin was provided`), so the README's PostCSS setup did not work for Next.js on webpack. `require('@navecss/core/postcss')` returns the plugin function itself and is the same function `import` gives you, with its own CommonJS type declarations. `@navecss/core/cx` and `@navecss/core/atoms` still load through `import` only. The README now has the Next.js setup and its browser floor.
