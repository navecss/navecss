---
'@navecss/tokens': minor
---

Two new semantic colours: a fill for a control under the pointer, the keyboard or a press, and a
scrim for behind a modal panel.

`--nave-color-action-highlight` is a neutral fill for a control under the pointer, the keyboard or a
press: a highlighted list or menu item, or a ghost button. It is never the only cue for focus or for
a state such as selected, checked, open or current, and it is not for disabled controls. Its text
pairs (`content.primary` and `content.secondary` on it) are declared and checked by the build.

`--nave-color-backdrop-modal` is the scrim behind a fully modal panel: neutral 950 at an alpha of
0.3 in light and 0.6 in dark. It is the one colour in the set that is translucent, so the build
refuses to declare it in any contrast pair. Use it only behind a fully modal panel, over a page the
reader cannot reach, and never under text, a control or a focus indicator the reader can reach.

`ColorPropertyName` gains both names. Nothing that shipped changes.
