---
'@navecss/base-ui': patch
---

The built stylesheet's bytes change and no computed value does. `@navecss/base-ui/styles.css` is
built through `@nave`, which now expands each atom where the directive is written, so where a
role has blocks of its own, `focusRing`'s `outline: none` moves: it now sits in an `& { }` rule
after those blocks. What a page shows is the same.
