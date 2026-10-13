---
'@navecss/base-ui': minor
---

Six more components, and the pieces the first release left unpainted.

`@navecss/base-ui/alert-dialog`, `/context-menu`, `/menubar`, `/preview-card`, `/combobox` and
`/autocomplete` each re-export every part of their Base UI subpath, with Nave's classes on the parts
the package styles, and the types Base UI exports beside them. A part's own types, such as
`Menu.Item.Props`, take their names and type parameters from Base UI 1.3, the oldest version the
package supports, so two spellings that Base UI 1.8.0 accepts do not compile through this package:
`ContextMenu.Root.Actions`, and `Combobox.Root.Props` with its third type parameter, `Item`. Import
`ContextMenuRootActions` and `ComboboxRootProps<Value, Multiple, Item>` from the same subpath
instead. The package now wraps 29 components. Alert Dialog's trigger and close join the Button
family, and a Menubar's menus come from `@navecss/base-ui/menu`.

Button, Toolbar.Button and the other members of the family take a third variant, `ghost`: no fill
or border at rest, the new highlight fill under the pointer and while its menu is showing.

Menu, Context Menu and Select items fill when highlighted. Combobox and Autocomplete mark the
option that Enter will choose with the same ring Nave draws around a focused control, because focus
stays in the text field. Alert Dialog's backdrop is painted with a scrim. Popups fade in and out,
tooltips fade, and the tab indicator slides; all of it is switched off under
`prefers-reduced-motion`, even when you have changed Nave's motion tokens. Motion you add or
restyle yourself is yours to switch off. Arrows take the logical start and end sides.

It needs `@navecss/tokens` 0.4.0 or later (the release that adds `--nave-color-action-highlight` and
`--nave-color-backdrop-modal`).
