---
'@navecss/tokens': minor
---

Two new semantic colours for the parts that paint a hover, a keyboard highlight or a modal panel.

`--nave-color-action-highlight` is a neutral fill for a control under the pointer, the keyboard or a
press: a highlighted list or menu item, a ghost button. It is never the only cue for focus or for a
state such as selected or open, and it is not painted on disabled controls. Its text pairs
(`content.primary` and `content.secondary` on it) are declared and checked by the build.

`--nave-color-backdrop-modal` is the scrim behind a fully modal panel: neutral 950 at an alpha of
0.3 in light and 0.6 in dark. It is the one colour in the set that is translucent, so the build
refuses to declare it in any contrast pair, and it is only for a layer that sits behind a panel the
reader cannot see past.

`ColorPropertyName` gains both names. Nothing that shipped changes.
