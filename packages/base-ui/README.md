# @navecss/base-ui

NaveCSS styles Base UI's components with Nave's tokens: the same parts, the same props, pre-styled.

This package is not affiliated with, endorsed by or sponsored by MUI or the Base UI project.

`@base-ui/react` is a separately installed peer, built and maintained by its own maintainers; this package does not include it. You change `@base-ui/react/<component>` to `@navecss/base-ui/<component>` in your imports, add one stylesheet, and every part keeps Base UI's props, refs and behaviour while gaining Nave's styling. The styling is zero-runtime styling: static classes and one static stylesheet, with all behaviour still Base UI's.

On this page: [Install](#install) · [Use it](#use-it) · [The stylesheet](#the-stylesheet) · [Variants](#variants) · [Overriding](#overriding) · [What is styled](#what-is-styled) · [Things to know](#things-to-know) · [License](#license)

## Install

```bash
pnpm add @navecss/base-ui @navecss/tokens @base-ui/react react react-dom
```

```bash
npm install @navecss/base-ui @navecss/tokens @base-ui/react react react-dom
```

It needs `@base-ui/react` 1.3 or later in the 1.x line, React 18 or 19, and `@navecss/tokens`. It does not need `@navecss/core`.

## Use it

Change the prefix of an import, and nothing else:

```ts
import { Dialog } from '@base-ui/react/dialog'
```

```tsx
import { Dialog } from '@navecss/base-ui/dialog'

export default function RenameDialog() {
  return (
    <Dialog.Root>
      <Dialog.Trigger>Rename</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
          <Dialog.Title>Rename file</Dialog.Title>
          <Dialog.Description>Choose a new name for this file.</Dialog.Description>
          <Dialog.Close>Done</Dialog.Close>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

Every subpath of Base UI that this package wraps is listed under [What is styled](#what-is-styled). Each one also re-exports every flat type name Base UI exports there, such as `DialogRootProps`, so those imports change the same way. Base UI's dotted type names, such as `Dialog.Root.Props`, come through as well, but not all of them: where one does not compile through this package, import Base UI's flat name for the same type from the same subpath. The end of [What is styled](#what-is-styled) names the ones left out by design. The package root, `@navecss/base-ui`, re-exports the same components.

## The stylesheet

Import Nave's tokens, then this package's stylesheet, before any stylesheet of yours that declares a `@layer`:

```css
/* app.css */
@import url('@navecss/tokens/css');
@import url('@navecss/base-ui/styles.css');
```

Both files begin with Nave's `@layer` order statement, and the order holds only if that statement is the first `@layer` declaration your page sees. The stylesheet is already built: nothing in your build needs to know about Nave, so it takes no plugin and no directive. Every rule in it sits in `@layer components.nave`, it declares no custom property and sets no `z-index`.

Nave's colours need Chrome or Edge 125, Firefox 128 or Safari 18, and your CSS build has to target the same floor, or it rewrites the colours into a form that does not follow the page's colour scheme. In Vite:

```text
  build: { cssTarget: ['chrome125', 'edge125', 'firefox128', 'safari18', 'ios18'] },
```

[Why that floor](https://github.com/navecss/navecss/blob/main/docs/04-adr/0005-browser-floor.md).

Tokens are CSS custom properties. If you scope a token yourself, set it on the part's own class or on `:root`, never on an ancestor of a part Base UI portals: a portalled popup renders outside that ancestor, so the token never reaches it.

## Variants

The Button family takes two optional props.

| Prop      | Values                                | Default       |
| --------- | ------------------------------------- | ------------- |
| `variant` | `'secondary'`, `'primary'`, `'ghost'` | `'secondary'` |
| `size`    | `'md'`, `'sm'`                        | `'md'`        |

They are accepted by `Button`, `Toolbar.Button`, and the trigger and close parts of Dialog, Alert Dialog and Popover, `Menu.Trigger` and `Tooltip.Trigger`. `ghost` is a button with no fill or border at rest that fills under the pointer and while the menu it opens is showing: it is the look of a Menubar's triggers. `Toggle` takes `size` only. Both are typed as those unions and neither reaches the DOM as a prop.

```tsx
import { Button } from '@navecss/base-ui/button'

export default function SaveButton() {
  return (
    <Button variant="primary" size="sm">
      Save
    </Button>
  )
}
```

## Overriding

There are three steps, from the lightest:

1. **Tokens.** Re-theme with Nave's tokens and every part follows. Nothing else is needed for a different palette, radius or spacing.
2. **`className`.** Pass a class to any part, as a string or as Base UI's function of the part's state. Put its rules in `@layer components.consumer`: that layer comes after Nave's, so your class wins in every state, whatever the specificity of Nave's rule. It also means that restyling a property restyles it in every state: set `background-color` on a Button and your colour replaces the `primary` variant's hover and active colours and a disabled button's too, so write the states you want yourself.
3. **The raw Base UI part.** Import the part from `@base-ui/react/<component>` and style it from scratch. It mixes freely with wrapped parts.

```css
/* menu.module.css */
@layer components.consumer {
  .popup {
    border-radius: var(--nave-radius-control);
  }
}
```

```tsx
import { Menu } from '@navecss/base-ui/menu'

export default function ActionsMenu() {
  return (
    <Menu.Root>
      <Menu.Trigger>Actions</Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner>
          <Menu.Popup className="popup">
            <Menu.Item>Rename</Menu.Item>
            <Menu.Item>Delete</Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
```

Behaviour is Base UI's. Parts Nave does not style, such as `Portal`, `Positioner`, `Provider` and `Form`, are Base UI's own parts, passed through unchanged.

## What is styled

| Group      | Subpaths                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overlays   | `@navecss/base-ui/dialog`, `@navecss/base-ui/popover`, `@navecss/base-ui/menu`, `@navecss/base-ui/select`, `@navecss/base-ui/tooltip`, `@navecss/base-ui/alert-dialog`, `@navecss/base-ui/context-menu`, `@navecss/base-ui/menubar`, `@navecss/base-ui/preview-card`, `@navecss/base-ui/combobox`, `@navecss/base-ui/autocomplete`                                                                                                           |
| Disclosure | `@navecss/base-ui/accordion`, `@navecss/base-ui/collapsible`, `@navecss/base-ui/tabs`                                                                                                                                                                                                                                                                                                                                                        |
| Controls   | `@navecss/base-ui/button`, `@navecss/base-ui/input`, `@navecss/base-ui/number-field`, `@navecss/base-ui/field`, `@navecss/base-ui/fieldset`, `@navecss/base-ui/form`, `@navecss/base-ui/checkbox`, `@navecss/base-ui/checkbox-group`, `@navecss/base-ui/radio`, `@navecss/base-ui/radio-group`, `@navecss/base-ui/switch`, `@navecss/base-ui/slider`, `@navecss/base-ui/toggle`, `@navecss/base-ui/toggle-group`, `@navecss/base-ui/toolbar` |

What this package does not paint: no backdrop colour behind a Dialog, no fill on the Slider's range, and Button sizes `md` and `sm` only. It paints an Alert Dialog's backdrop as a scrim and recommends no other scrim value. What it leaves out you can add with a class of your own, as above.

Menubar's menus come from `@navecss/base-ui/menu`: the same `Menu` as anywhere else, and the triggers take `variant="ghost"`.

```tsx
import { Menu } from '@navecss/base-ui/menu'
import { Menubar } from '@navecss/base-ui/menubar'

export default function AppMenubar() {
  return (
    <Menubar>
      <Menu.Root>
        <Menu.Trigger variant="ghost">File</Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner>
            <Menu.Popup>
              <Menu.Item>New</Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      <Menu.Root>
        <Menu.Trigger variant="ghost">Edit</Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner>
            <Menu.Popup>
              <Menu.Item>Undo</Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </Menubar>
  )
}
```

A Combobox puts its input inside an `InputGroup`:

```tsx
import { Combobox } from '@navecss/base-ui/combobox'

export default function FruitCombobox() {
  return (
    <Combobox.Root items={['apple', 'banana']}>
      <Combobox.InputGroup>
        <Combobox.Input />
        <Combobox.Trigger>
          <Combobox.Icon />
        </Combobox.Trigger>
      </Combobox.InputGroup>
      <Combobox.Portal>
        <Combobox.Positioner>
          <Combobox.Popup>
            <Combobox.List>
              {(item: string) => (
                <Combobox.Item key={item} value={item}>
                  {item}
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}
```

A right-to-left app needs both `dir="rtl"` on `<html>` (or on the element you pass as a Portal's `container`) and Base UI's `DirectionProvider`, imported from `@base-ui/react/direction-provider`, with the same direction. With only one of them, a popup that opens on the `inline-start` or `inline-end` side shows its arrow pointing away from what opened it.

Context Menu's trigger area is your own element, and Nave paints nothing on it.

Parts that Base UI added after 1.3 are exported as whatever your installed version provides. In this release the only such part is Combobox's `createItems`, added in Base UI 1.8.0. On 1.3 to 1.7 it is `undefined`, as it is in Base UI itself, and building an app that imports `@navecss/base-ui` or `@navecss/base-ui/combobox` may print a bundler warning that `createItems` has no matching export in Base UI's combobox module, even if the app never uses it. Vite prints it as `IMPORT_IS_UNDEFINED`. The warning is harmless and stops on Base UI 1.8.0. The package keeps it because avoiding it would make every app that uses `createItems` bundle all of Combobox.

The types under a part, such as `Menu.Item.Props`, take their names and type parameters from Base UI 1.3, so two that Base UI added up to 1.8.0 do not come through: `ContextMenu.Root.Actions`, and the third type parameter of `Combobox.Root.Props`, `Item`. Import `ContextMenuRootActions` from `@navecss/base-ui/context-menu` and `ComboboxRootProps<Value, Multiple, Item>` from `@navecss/base-ui/combobox` instead.

## Things to know

When a disclosure trigger's last child is an `svg`, that icon turns when the panel opens. A lone icon counts as the last child, so put a decorative leading icon inside an element of its own:

```tsx
import { Accordion } from '@navecss/base-ui/accordion'

export default function ShippingAccordion() {
  return (
    <Accordion.Root>
      <Accordion.Item value="shipping">
        <Accordion.Header>
          <Accordion.Trigger>
            <span>
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <circle cx="8" cy="8" r="6" />
              </svg>
            </span>
            Shipping
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path d="M3 6l5 5 5-5" />
            </svg>
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Panel>Orders ship within two working days.</Accordion.Panel>
      </Accordion.Item>
    </Accordion.Root>
  )
}
```

The Accordion and Collapsible panels set `overflow: hidden` so their height can animate, which also clips anything drawn outside the panel's box, focus rings included. Each panel insets its content by enough for Nave's focus ring: at both sides, above its first element and below its last. That inset reaches elements only, so a panel that starts or ends with bare text gets none there, and your own margins on those elements replace it. Keep at least the width plus the offset of your focus ring clear around any focusable element at the panel's edge.

When nothing inside a popup can take focus, Base UI focuses the popup itself and the browser draws its focus ring around the panel. This package leaves that ring alone. Removing it with `outline: 0`, as Base UI's own demos do, leaves a keyboard user with no visible sign of where focus is.

In Combobox and Autocomplete, keyboard focus stays in the text field while the arrow keys move through the list, so Nave marks the option that Enter will choose with the same ring it draws around a focused control. Hovering an option makes it the one Enter chooses, so the ring follows the pointer too. The ring is drawn on the option's `::before`; a rule of yours that sets `::before` on options replaces it.

Nave draws the Combobox and Autocomplete field's border on `InputGroup`, not on the input. If you place the input outside an `InputGroup`, wrap it in an element with a visible border of your own, or the field has no visible edge until it is focused.

In Chromium, opening a Context Menu with a right-click shows focus rings: the browser's own ring around the menu, then a focus ring on whichever item the pointer is over. Chromium decides when a focus ring shows; Nave does not hide it, and other browsers may show it differently.

A Preview Card opens when its link is hovered or focused, but its contents are not reachable with Tab: the next Tab moves past the card and closes it. Keep anything a reader must act on, such as a link or a button, out of the card, or offer it on the page as well.

In a Menubar, moving to the next menu with the arrow keys puts focus on that menu's panel before any item, so the browser's ring around the panel shows where you are until the next arrow key reaches an item.

In Base UI 1.8.0, `Menu.LinkItem` has no disabled state: a `disabled` prop reaches the `<a>` as a plain attribute, the link still activates, and it does not take the disabled colour Nave gives the other menu items.

When the reader's system asks for reduced motion, this package turns off the popups' fade, the tooltip's fade, the backdrop's fade, the tab indicator's slide, the motion of Accordion and Collapsible panels opening and closing, the turn of the icon in their triggers and the switch's slide, even if you have changed Nave's motion tokens. Motion you add or restyle yourself is yours to switch off.

## License

MIT. See [LICENSE](https://github.com/navecss/navecss/blob/main/packages/base-ui/LICENSE).
