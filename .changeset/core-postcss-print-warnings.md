---
'@navecss/core': minor
---

The PostCSS plugin takes a new option, `printWarnings` (default `true`): with `printWarnings: false`, a problem under `onUnknown: 'warn'` is raised as a PostCSS warning and never printed, even on Turbopack, for a tool that runs the plugin itself and reports its warnings.
