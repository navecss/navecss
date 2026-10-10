# @navecss/base-ui

NaveCSS styles Base UI's components with Nave's tokens: the same parts, the same props, pre-styled.

This package is not affiliated with, endorsed by or sponsored by MUI or the Base UI project.

`@base-ui/react` is a separately installed peer, built and maintained by its own maintainers; this package does not include it. You change `@base-ui/react/<component>` to `@navecss/base-ui/<component>` in your imports, add one stylesheet, and every part keeps Base UI's props, types, refs and behaviour while gaining Nave's styling. The styling is zero-runtime styling: static classes and one static stylesheet, with all behaviour still Base UI's.

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

Every subpath of Base UI that this package wraps is listed under [What is styled](#what-is-styled). Each one also re-exports every type Base UI exports there, so type imports change the same way. The package root, `@navecss/base-ui`, re-exports the same components.

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

| Prop      | Values                     | Default       |
| --------- | -------------------------- | ------------- |
| `variant` | `'secondary'`, `'primary'` | `'secondary'` |
| `size`    | `'md'`, `'sm'`             | `'md'`        |

They are accepted by `Button`, `Toolbar.Button`, and the trigger and close parts of Dialog and Popover, `Menu.Trigger` and `Tooltip.Trigger`. `Toggle` takes `size` only. Both are typed as those unions and neither reaches the DOM as a prop.

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
| Overlays   | `@navecss/base-ui/dialog`, `@navecss/base-ui/popover`, `@navecss/base-ui/menu`, `@navecss/base-ui/select`, `@navecss/base-ui/tooltip`                                                                                                                                                                                                                                                                                                        |
| Disclosure | `@navecss/base-ui/accordion`, `@navecss/base-ui/collapsible`, `@navecss/base-ui/tabs`                                                                                                                                                                                                                                                                                                                                                        |
| Controls   | `@navecss/base-ui/button`, `@navecss/base-ui/input`, `@navecss/base-ui/number-field`, `@navecss/base-ui/field`, `@navecss/base-ui/fieldset`, `@navecss/base-ui/form`, `@navecss/base-ui/checkbox`, `@navecss/base-ui/checkbox-group`, `@navecss/base-ui/radio`, `@navecss/base-ui/radio-group`, `@navecss/base-ui/switch`, `@navecss/base-ui/slider`, `@navecss/base-ui/toggle`, `@navecss/base-ui/toggle-group`, `@navecss/base-ui/toolbar` |

Version 1 does not paint everything. It has no highlight on the hovered or arrowed item of a menu or select, no scrim colour behind a dialog (its backdrop has no paint, and this package recommends no value for one), no motion on popups, tooltips or the tab indicator, an arrow that sits on physical sides only (top, bottom, left and right, not the logical start and end), and no fill on a slider's range. Button comes in `secondary` and `primary`, in sizes `md` and `sm`, and no other. What it leaves out you can add with a class of your own, as above.

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

In Base UI 1.8.0, `Menu.LinkItem` has no disabled state: a `disabled` prop reaches the `<a>` as a plain attribute, the link still activates, and it does not take the disabled colour Nave gives the other menu items.

When the reader's system asks for reduced motion, this package turns off the motion of Accordion and Collapsible panels opening and closing, the turn of the icon in their triggers and the switch's slide, even if you have changed Nave's motion tokens. Motion you add or restyle yourself is yours to switch off.

## License

MIT. See [LICENSE](https://github.com/navecss/navecss/blob/main/packages/base-ui/LICENSE).
