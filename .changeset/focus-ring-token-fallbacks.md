---
'@navecss/core': patch
---

The `focusRing` atom now draws a ring on keyboard focus even when the focus tokens are missing. It used to restore its outline with a single `outline` shorthand that read `--nave-border-width-focus` and `--nave-color-border-focus` without fallbacks, so when the token stylesheet did not load, when your own token layer (`@navecss/core/no-tokens`) left those properties out, or when one held a value of the wrong type, the shorthand was invalid as a whole and computed to `none`: the default outline was removed and nothing replaced it. The ring is now `outline-style`, `outline-width` and `outline-color`, with fallbacks of `2px` and the element's own text colour (`currentColor`). Nothing changes when the tokens are present. The `@navecss/core/no-tokens` header comment no longer cites the focus outline as its example of a lost property.
