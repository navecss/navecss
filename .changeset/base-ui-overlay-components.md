---
'@navecss/base-ui': minor
---

Six more components, and the pieces the first release left unpainted.

`@navecss/base-ui/alert-dialog`, `/context-menu`, `/menubar`, `/preview-card`, `/combobox` and
`/autocomplete` each re-export every part of their Base UI subpath, with Nave's classes on the parts
the package styles, and the types Base UI exports beside them. The types under a part, such as
`Menu.Item.Props`, take their names and type parameters from Base UI 1.3, the oldest version the
package supports, so two that Base UI added up to 1.8.0 do not come through:
`ContextMenu.Root.Actions`, and the third type parameter of `Combobox.Root.Props`, `Item`. Import
`ContextMenuRootActions` and `ComboboxRootProps<Value, Multiple, Item>` from the same subpath
instead. A part that Base UI also exports as a type, such as `Dialog.Trigger`, now works as a type
through this package too. On Base UI 1.3 to 1.7, Combobox's `createItems` is `undefined`, as it is
in Base UI, and a build that imports the package root or `@navecss/base-ui/combobox` may print a
harmless bundler warning about it. The package now wraps 29 components. Alert Dialog's trigger and
close join the Button family, and a Menubar's menus come from `@navecss/base-ui/menu`.

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
