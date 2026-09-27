---
'@navecss/tokens': patch
---

Parsing a theming seed and scanning a `validate --source` stylesheet no longer slow down sharply on unusual input. A `--seed` colour whose channel list held a very long run of spaces or tabs between two values took time growing with the square of that run, and so did a stylesheet passed to `navecss-tokens validate --source` (or to `validate()` from `@navecss/tokens/build`) containing a very long run of dashes or many unclosed `/*` comments. All three now take time in proportion to the input. `validate` also no longer counts a name that only appears inside a longer one, such as `--primary` in `.btn--primary:hover`, as a declared custom property; a real declaration such as `--nave-color-surface-base: white` is read exactly as before.
