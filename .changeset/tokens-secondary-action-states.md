---
'@navecss/tokens': minor
---

The secondary action fill gains a hover and an active colour, so a secondary button can answer the
pointer and a press the way a primary one does.

`--nave-color-action-secondary-hover` is neutral 150 in light and 700 in dark, and
`--nave-color-action-secondary-active` is neutral 200 in light and 850 in dark. A press is darker
than rest in both schemes, and in dark the hover is the same step as the highlight fill
(`action.highlight`). They change the fill only: the text on them stays `content.primary` and the
identifying border stays `border.control`, as on the resting fill. Both follow the tint, and the
achromatic branch leaves them as they are. Their text pairs (`content.primary` on each) are
declared and checked by the build.

`ColorPropertyName` gains both names. Nothing that shipped changes.
