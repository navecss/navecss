---
'@navecss/stylelint-config': minor
---

New package: `@navecss/stylelint-config`, a shareable stylelint configuration for a project
using Nave. Extend it (`{ "extends": ["@navecss/stylelint-config"] }`) to get: `@nave` known to
stylelint, so it is never reported as an unknown at-rule; a check that colour, spacing, radius,
typography and a handful of other design-system-shaped properties use a variable, a function
consuming one, or an admitted keyword, rather than a raw literal; a check that flags
`outline: none` and `outline: 0`; and `@navecss/declared-custom-properties`, which reports a
`var(--nave-*)` reference that names nothing declared in your token stylesheet (including one
nested inside another `var()`'s fallback or inside a custom property's own value) — this passes
the build and renders nothing otherwise. The default declaration source is `@navecss/tokens`'
published stylesheet, which this package takes as a peer dependency (`>=0.1.0 <1.0.0`); a rule
option can name your own stylesheet instead. See the package README for what it does not check,
and how to turn any of it off.
