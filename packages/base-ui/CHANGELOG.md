# @navecss/base-ui

## 0.2.0

### Minor Changes

- c20ff6d: Seven more components: Toast, Navigation Menu, Scroll Area, Meter, Progress, Avatar and Separator.

  `@navecss/base-ui/toast`, `/navigation-menu`, `/scroll-area`, `/meter`, `/progress`, `/avatar` and
  `/separator` each re-export every part and every type of their Base UI subpath, with Nave's classes
  on the parts the package styles. The package now wraps 36 components.

  Toasts are a plain list fixed to the bottom corner of the window, above Nave's dialogs and popups,
  and they fade in and out. An anchored toast is the exception: Base UI places it beside its anchor,
  still above Nave's dialogs and popups. Toasts beyond the provider's `limit`, which Base UI makes
  inert, are hidden. `Toast.Action` and `Toast.Close` join the Button family. The Navigation Menu's
  trigger has a quieter look of its own, its panel fades in, and the link for the current page, the
  one with `aria-current="page"`, gets a thicker underline. Scroll Area paints the scrollbar of each
  direction that can scroll as a 1.5rem strip and does not fade it out, because Base UI hides the
  browser's own. Meter and Progress share one bar: an outlined track with a solid fill, and only the
  track for an indeterminate Progress. `Avatar.Root` takes a `size` of `'sm'`, `'md'` or `'lg'`.
  `Separator` is the separator the Toolbar already uses. As with the earlier components, the types
  under a part take their names and type parameters from Base UI 1.3, so `NavigationMenu.Root.Value`
  and the type parameter of `NavigationMenu.Root.Props` do not come through: use
  `NavigationMenuRootProps<Value>` and `NavigationMenuRoot.Value<Value>` from
  `@navecss/base-ui/navigation-menu`.

  The stylesheet now sets one `z-index`, on the toast area, from `--nave-layer-toast`. All the motion
  the new styles add is switched off under `prefers-reduced-motion`, even when you have changed Nave's
  motion tokens. The README says how to set up Toast and Navigation Menu and what to give the viewport
  of a Scroll Area.

- 3fd5a57: Six more components, and the pieces the first release left unpainted.

  `@navecss/base-ui/alert-dialog`, `/context-menu`, `/menubar`, `/preview-card`, `/combobox` and
  `/autocomplete` each re-export every part of their Base UI subpath, with Nave's classes on the parts
  the package styles, and the types Base UI exports beside them. The types under a part, such as
  `Menu.Item.Props`, take their names and type parameters from Base UI 1.3, the oldest version the
  package supports, so two that Base UI added up to 1.8.0 do not come through:
  `ContextMenu.Root.Actions`, and the third type parameter of `Combobox.Root.Props`, `Item`. Import
  `ContextMenuRootActions` and `ComboboxRootProps<Value, Multiple, Item>` from the same subpath
  instead. On Base UI 1.3 to 1.7, Combobox's `createItems` is `undefined`, as it is in Base UI, and
  a build that imports the package root or `@navecss/base-ui/combobox` may print a harmless bundler
  warning about it. The package now wraps 29 components. Alert Dialog's trigger and close join the
  Button family, and a Menubar's menus come from `@navecss/base-ui/menu`.

  Button, Toolbar.Button and the other members of the family take a third variant, `ghost`: no fill
  or border at rest, the new highlight fill under the pointer and while its menu is showing.

  Menu, Context Menu and Select items fill when highlighted. Combobox and Autocomplete mark the
  option that Enter will choose with the same ring Nave draws around a focused control, because focus
  stays in the text field. Alert Dialog's backdrop is painted with a scrim. Popups fade in and out,
  tooltips fade, and the tab indicator slides; all of it is switched off under
  `prefers-reduced-motion`, even when you have changed Nave's motion tokens. Motion you add or
  restyle yourself is yours to switch off. Arrows take the logical start and end sides.

  Two kinds of type the first release left out now resolve through the package as they do through
  Base UI: a part that Base UI also exports as a type, such as `Dialog.Trigger`, and the type names
  a component namespace exports only as types, `Field.ValidityData` and `Toolbar.Orientation`.

  It needs `@navecss/tokens` 0.4.0 or later (the release that adds `--nave-color-action-highlight` and
  `--nave-color-backdrop-modal`).

## 0.1.0

### Minor Changes

- 13bbd47: First release. `@navecss/base-ui` is Base UI's own components, pre-styled with Nave's tokens: change
  `@base-ui/react/<component>` to `@navecss/base-ui/<component>` in an import, import one stylesheet
  after Nave's tokens, and every part keeps Base UI's props, types, refs and behaviour while gaining
  Nave's styling. It covers 23 components: Dialog, Popover, Menu, Select, Tooltip, Accordion,
  Collapsible, Tabs, Button, Input, Number Field, Field, Fieldset, Form, Checkbox, Checkbox Group,
  Radio, Radio Group, Switch, Slider, Toggle, Toggle Group and Toolbar. Buttons, and the triggers and
  close parts of the overlays, take `variant` (`secondary` or `primary`) and `size` (`md` or `sm`).

  A class you pass to any part wins over the package's rules in every state, because they sit in
  `components.nave` and yours go in `components.consumer`. The stylesheet needs no build plugin, and
  the package adds no JavaScript that computes a style.

  It needs `@base-ui/react` 1.3 or later in the 1.x line, React 18 or 19, and `@navecss/tokens` 0.3.0
  or later (the release that adds `--nave-border-width-mark`, which a checked Checkbox draws its mark
  with).

  `@navecss/bridge`, a private placeholder that was never published, is removed.
