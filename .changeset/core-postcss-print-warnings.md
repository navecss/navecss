---
'@navecss/core': minor
---

The PostCSS plugin takes a new option, `printWarnings` (default `true`): with `printWarnings: false`, each problem under `onUnknown: 'warn'` and each order warning is raised as a PostCSS warning and never printed, even on Turbopack, for a tool that runs the plugin itself and reports its warnings. Such a tool can tell the two apart with `isOrderWarning()`, a new export of `@navecss/core/postcss` that is `true` for an order warning: report those whatever `onUnknown` says and never count one as a problem, since the plugin never fails a build on an order warning.
