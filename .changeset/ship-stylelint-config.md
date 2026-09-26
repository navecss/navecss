---
'@navecss/stylelint-config': minor
---

New package: `@navecss/stylelint-config`, a shareable stylelint configuration for a project
using Nave. Extend it (`{ "extends": ["@navecss/stylelint-config"] }`) to get: `@nave` known to
stylelint, so it is never reported as an unknown at-rule; a check that colour, spacing, radius,
typography and a handful of other design-system-shaped properties use a variable, a function
consuming one, or an admitted keyword, rather than a raw literal; and a check that flags
`outline: none` and `outline: 0`. See the package README for what it does not check, and how to
turn any of it off.
