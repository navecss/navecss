---
'@navecss/stylelint-config': minor
---

Adds `@navecss/declared-custom-properties`, enabled by default: a `var(--nave-*)` reference that names nothing declared in your token stylesheet passes the build and renders nothing today — this rule reports it, including a reference nested inside another `var()`'s fallback or inside a custom property's own value. The default declaration source is `@navecss/tokens`' published stylesheet, which this package now takes as a peer dependency (`>=0.1.0 <1.0.0`); a rule option can name your own stylesheet instead.
