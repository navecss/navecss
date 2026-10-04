---
'@navecss/tokens': patch
---

The comment at the head of the generated theming block now names the package whose README it points
at: `See the @navecss/tokens README ("Theming").` It used to say "this package's README", which was
true in `@navecss/tokens/css` and wrong where the same text now ships, inside `@navecss/core`'s
single-file stylesheet. No rule, property or value changes.
