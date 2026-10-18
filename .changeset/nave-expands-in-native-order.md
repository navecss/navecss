---
'@navecss/core': minor
---

`@nave` now expands in the order CSS mixins will apply it: each atom's declarations, then that
atom's own pseudo-class, `@media` and `@container` blocks, atom by atom, where the directive is
written, and whatever your rule says after the directive comes after all of it. Until this
release every atom's blocks were placed at the end of the rule, so they won over anything written
after the directive. Now the later declaration wins, as it does elsewhere in CSS, and two shapes
change what a page shows:

- A responsive atom named before an atom that sets the same property. `@nave hideDesktopUp flex;`
  used to hide the element from 75em up, and now shows it as flex. Name the responsive atom last:
  `@nave flex hideDesktopUp;`.
- A declaration or nested block of your own, after the directive, that sets a property one of the
  atom's blocks sets. `.panel { @nave hideDesktopUp; display: grid; }` used to hide the panel from
  75em up, and now shows it as a grid. Move the declaration above the directive to keep the old
  result.

This includes focus styles. After `@nave focusRing;`, a later `&:focus { outline: none }` or
`&:focus-visible { outline: none }` in the same rule used to leave the ring in place, and now
removes it, so the element has no focus indicator from `focusRing` under keyboard focus. Move
the block above the directive to keep the ring. A later `&:focus-visible { outline-color: ... }`
after `focusRing`, or `&:focus-visible { position: fixed }` after `srOnlyFocusable`, used to be
ignored and now applies.

With Vite's `css.transformer: 'lightningcss'` at targets below the browser floor, Lightning CSS
moves what a rule says after a directive into a rule of its own before Nave sees it, so that
content already resolved this way there, focus styles included, and the build cannot report it.

The build reports each such place as a warning naming the atom, the condition, the property with
both values, and the fix. Where the later content is not itself an atom's block, the warning also
says what the result was before: `Before @navecss/core 0.5.0 "hideDesktopUp" won, because an atom's
blocks were placed last in the rule.` It never fails the build, `onUnknown` does not change it, and
no option turns it off. The result of `expandText()` carries the warnings in a new field,
`warnings`, beside `diagnostics`. Where the later declaration is meant to win, mark the directive:
`@nave /* nave-allow-override: display */ hideDesktopUp;`. The marker covers the properties it
names on that directive only, and is reported once nothing overrides them. See "Order inside a
rule" in the package README.

Declarations that now follow a nested block are written inside `& { }`, the wrapper Nave already
used for a directive written after a nested rule. Under a selector list, `&` matches with the
specificity of the list's most specific selector, so such a declaration can now win over a rule
elsewhere that it used to lose to; write it above the directive to keep the old result.
`dist/atomic.css` and `cx()` are unchanged.

`LICENSE` now also credits mdn-data and the CSS specifications that the property table behind the warning is derived from.
