---
'@navecss/core': minor
---

Ships `nave.css-data.json`, a CSS custom-data file generated from the atom source that declares the `@nave` at-rule to VS Code's CSS language service. Point `css.customData` at it and the editor stops reporting `@nave` as an unknown at-rule, still catches a misspelt one, and on hover describes `@nave` and lists the built-in atom names by section. The file adds no atom-name suggestions as you type. `ATOMS.md`'s Variants column now also renders each pseudo-class, `@media` and `@container` variant's own declarations beside its selector, rather than the selector alone.
