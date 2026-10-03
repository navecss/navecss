---
'@navecss/tokens': minor
---

Adds `--nave-border-width-mark` (2px), a stroke width for glyphs drawn in CSS such as check
marks and indeterminate bars, so they can use their own width rather than the focus ring's. Nothing
in Nave draws such a glyph yet, so no existing output changes. The documented
colour pairs also grow to cover text and controls on the raised and overlay surfaces:
`content.primary`, `content.secondary`, `content.tertiary` and `content.link` as text, the
`feedback.danger.foreground` text pair on the base, raised and overlay surfaces, and
`action.primary` and `feedback.danger` as non-text against the raised and overlay surfaces. The
build now checks a contrast floor for each of those pairs. `--nave-radius-control`'s description
now says it also covers popovers, menus and select lists anchored to a control.
