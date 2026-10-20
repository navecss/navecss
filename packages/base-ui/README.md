# @navecss/base-ui

NaveCSS styles Base UI's components with Nave's tokens: the same parts, the same props, pre-styled.

This package is not affiliated with, endorsed by or sponsored by MUI or the Base UI project.

`@base-ui/react` is a separately installed peer, built and maintained by its own maintainers; this package does not include it. You change `@base-ui/react/<component>` to `@navecss/base-ui/<component>` in your imports, add one stylesheet, and every part keeps Base UI's props, refs and behaviour while gaining Nave's styling. The styling is zero-runtime styling: static classes and one static stylesheet, with all behaviour still Base UI's.

On this page: [Install](#install) · [Use it](#use-it) · [The stylesheet](#the-stylesheet) · [Variants](#variants) · [Overriding](#overriding) · [Copy a component](#copy-a-component-into-your-project) · [What is styled](#what-is-styled) · [Feedback and navigation](#feedback-and-navigation) · [Things to know](#things-to-know) · [License](#license)

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

A Server Component can import a namespace such as `Dialog` from a subpath and render its parts, `Dialog.Root` among them, without a `'use client'` directive of its own.

## The stylesheet

Import Nave's tokens, then this package's stylesheet, before any stylesheet of yours that declares a `@layer`:

```css
/* app.css */
@import url('@navecss/tokens/css');
@import url('@navecss/base-ui/styles.css');
```

Both files begin with Nave's `@layer` order statement, and the order holds only if that statement is the first `@layer` declaration your page sees. The stylesheet is already built: nothing in your build needs to know about Nave, so it takes no plugin and no directive. Every rule in it sits in `@layer components.nave` and it declares no custom property. It sets one `z-index`, on the toast area, from `--nave-layer-toast`.

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

`Toast.Action` and `Toast.Close` take both props too. `NavigationMenu.Trigger` has a quieter look of its own and takes neither. `Avatar.Root` takes a `size` of its own: `'sm'`, `'md'` (the default) or `'lg'`.

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

There are four steps, from the lightest:

1. **Tokens.** Re-theme with Nave's tokens and every part follows. Nothing else is needed for a different palette, radius or spacing.
2. **`className`.** Pass a class to any part, as a string or as Base UI's function of the part's state. Put its rules in `@layer components.consumer`: that layer comes after Nave's, so your class wins in every state, whatever the specificity of Nave's rule. It also means that restyling a property restyles it in every state: set `background-color` on a Button and your colour replaces the `primary` variant's hover and active colours and a disabled button's too, so write the states you want yourself.
3. **A copy of the component.** To change Nave's rules for a component rather than override them, copy its files into your project with shadcn's CLI and change the copy: see [Copy a component into your project](#copy-a-component-into-your-project).
4. **The raw Base UI part.** Import the part from `@base-ui/react/<component>` and style it from scratch. It mixes freely with wrapped parts.

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

## Copy a component into your project

Every component this package styles is also in Nave's shadcn registry: one command copies the component's files into your project, and you then change its rules in the copy instead of overriding them.

With `@navecss/base-ui` installed, add a component from the files of the version you have:

```bash
npx shadcn@latest add ./node_modules/@navecss/base-ui/dist/registry/base-ui-dialog.json
```

Replace `dialog` with the subpath of the component you want, from [What is styled](#what-is-styled), and list several paths to add several components. The copy then comes from the same release as the components you still import from the package, with no version to type: `add` reads the files it copies from `node_modules` instead of downloading them. The command needs no Tailwind, no `components.json` and no `shadcn init`: every file in the registry says where it goes, so `add` installs it into a project that has none of them. Run `add` for Nave's components alone, with no item from another registry in the same command: shadcn's CLI decides from the first item it is given whether the project needs that setup.

The registry is also served at an exact version of `@navecss/base-ui`. Use that address in a project without the package installed, or with Yarn Plug'n'Play, which has no `node_modules`:

```bash
npx shadcn@latest add https://cdn.jsdelivr.net/npm/@navecss/base-ui@<version>/dist/registry/base-ui-dialog.json
```

Replace `<version>` with the version of `@navecss/base-ui` your project has, if it has one (`npm ls @navecss/base-ui` or `pnpm list @navecss/base-ui` prints it), so the copy matches the components you still import from the package; if not, use the latest version.

For shadcn's MCP server, which agents use, and for `shadcn search`, map the `@navecss` namespace to that address once. shadcn's CLI writes the mapping into your `package.json`, under `registries`, with the version in the address, so change the version there when you upgrade:

```bash
npx shadcn@latest registry add '@navecss=https://cdn.jsdelivr.net/npm/@navecss/base-ui@<version>/dist/registry/{name}.json'
npx shadcn@latest add @navecss/base-ui-dialog
```

`add` writes the files to `components/nave/`, or to `src/components/nave/` in a project with a `src` folder; `--path <folder>` writes them to that folder instead. For Dialog, in the order `add` writes them:

- `nave-dialog.ts`, the module you import;
- `nave-dialog.parts.ts`, its parts;
- `nave-dialog.wrap.ts`, the code that adds the classes to those parts;
- `nave-dialog.module.css`, the rules for those parts;
- `NAVECSS-LICENSE`.

Then import the component from the copy instead of from the package, with a path relative to the importing file, for example `import { Dialog } from './components/nave/nave-dialog'`. The copy's parts take the same props as the package's, `variant` and `size` included.

The copied rules read Nave's tokens, so keep `@navecss/tokens/css` imported as [The stylesheet](#the-stylesheet) shows. The copy imports neither `@navecss/base-ui` nor its `styles.css`: keep those while you still import any component from the package; a copy and the package's components work side by side. The first rule of each `.module.css` is Nave's `@layer` order statement, as in `styles.css`, and your build has to support CSS Modules, as Vite and Next.js do without setup. A change to one copy reaches no other copy and no component from the package.

A component added this way keeps its rules in `@layer components.consumer`, the layer your classes use, so a class you pass to one of its parts no longer wins in every state as it does on the package's components: the copied rules for hover, focus, disabled and the other states are more specific than one class, and still apply. A change to those states takes effect in the copied rules.

No later release of `@navecss/base-ui` changes the copied files. To take a later release's version of a component, upgrade the package and run `add` again, or use that release's address. `add` asks before it replaces a copied file whose content differs from the new one, whether you changed it or the release did, and `--overwrite` replaces them without asking. In a run with no terminal to answer, such as an agent or a CI job, it stops at the first such file and still exits with success, so that file and the ones after it stay as they were. The exit status does not show that it stopped, but the output does: it ends with the question about that file.

The registry names no versions for the packages a copy depends on, so `add` leaves the versions in your `package.json` as they are, and installs the latest version of any that is missing. A copy needs `@base-ui/react` 1.3 or later in the 1.x line, `@navecss/tokens` 0.4.0 or later before 1.0, and React 18 or 19.

## What is styled

| Group      | Subpaths                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overlays   | `@navecss/base-ui/dialog`, `@navecss/base-ui/popover`, `@navecss/base-ui/menu`, `@navecss/base-ui/select`, `@navecss/base-ui/tooltip`, `@navecss/base-ui/alert-dialog`, `@navecss/base-ui/context-menu`, `@navecss/base-ui/menubar`, `@navecss/base-ui/preview-card`, `@navecss/base-ui/combobox`, `@navecss/base-ui/autocomplete`                                                                                                           |
| Disclosure | `@navecss/base-ui/accordion`, `@navecss/base-ui/collapsible`, `@navecss/base-ui/tabs`                                                                                                                                                                                                                                                                                                                                                        |
| Controls   | `@navecss/base-ui/button`, `@navecss/base-ui/input`, `@navecss/base-ui/number-field`, `@navecss/base-ui/field`, `@navecss/base-ui/fieldset`, `@navecss/base-ui/form`, `@navecss/base-ui/checkbox`, `@navecss/base-ui/checkbox-group`, `@navecss/base-ui/radio`, `@navecss/base-ui/radio-group`, `@navecss/base-ui/switch`, `@navecss/base-ui/slider`, `@navecss/base-ui/toggle`, `@navecss/base-ui/toggle-group`, `@navecss/base-ui/toolbar` |
| Feedback   | `@navecss/base-ui/toast`, `@navecss/base-ui/progress`, `@navecss/base-ui/meter`                                                                                                                                                                                                                                                                                                                                                              |
| Navigation | `@navecss/base-ui/navigation-menu`, `@navecss/base-ui/scroll-area`                                                                                                                                                                                                                                                                                                                                                                           |
| Display    | `@navecss/base-ui/avatar`, `@navecss/base-ui/separator`                                                                                                                                                                                                                                                                                                                                                                                      |

What this package does not paint: no backdrop colour behind a Dialog, no fill on the Slider's range, and Button sizes `md` and `sm` only. Toasts form a plain list, not a stack of cards that fans out, and there is no motion when the Navigation Menu panel closes. It paints an Alert Dialog's backdrop as a scrim and recommends no other scrim value. What it leaves out you can add with a class of your own, as above.

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

Combobox's `createItems` is not exported here: Base UI added it in 1.8.0, and this package supports Base UI from 1.3. On 1.8.0 or later, import it from Base UI and pass what it returns to `items` on this package's `Combobox.Root`:

```ts
import { Combobox as BaseCombobox } from '@base-ui/react/combobox'

const fruits = BaseCombobox.createItems(
  [
    { id: 1, name: 'Apple' },
    { id: 2, name: 'Banana' },
  ],
  { getValue: (fruit) => fruit.id, getLabel: (fruit) => fruit.name },
)
```

The types under a part, such as `Menu.Item.Props`, take their names and type parameters from Base UI 1.3, so nine that Base UI added up to 1.9.0 do not come through: `ContextMenu.Root.Actions`, the third type parameter of `Combobox.Root.Props` (`Item`), the type parameter of `NavigationMenu.Root.Props`, `NavigationMenu.Root.Value`, `OpenChangeEventDetails` under the roots of Select, Combobox and Autocomplete, and `Menu.Root.HighlightEventDetails` and `Menu.Root.HighlightEventReason`. Import `ContextMenuRootActions` from `@navecss/base-ui/context-menu`, `ComboboxRootProps<Value, Multiple, Item>` from `@navecss/base-ui/combobox`, `NavigationMenuRootProps<Value>` and `NavigationMenuRoot.Value<Value>` from `@navecss/base-ui/navigation-menu`, `SelectRootOpenChangeEventDetails`, `ComboboxRootOpenChangeEventDetails` and `AutocompleteRootOpenChangeEventDetails` from their own subpaths, and `MenuRootHighlightEventDetails` and `MenuRootHighlightEventReason` from `@navecss/base-ui/menu` instead.

Two more things Base UI 1.9.0 added are not exported here, because this package supports Base UI from 1.3. The Menu's filtering parts (`Menu.FilterProvider`, `Menu.Input`, `Menu.List`, `Menu.Empty`, `Menu.Clear` and `Menu.useFilter`), which Base UI marks as a preview, are left out, and Nave does not style them; import them from `@base-ui/react/menu` if you use them. Their flat type names, such as `MenuInputProps` and `MenuFilter`, still come through. The objects that name each part's data attributes and CSS variables, such as `DialogPopupDataAttributes`, come through as types only: to read their values, import them from Base UI's subpath.

## Feedback and navigation

Toast, Navigation Menu, Scroll Area, Meter, Progress, Avatar and Separator are imported with the same prefix swap as the rest: `@navecss/base-ui/toast`, `@navecss/base-ui/navigation-menu`, `@navecss/base-ui/scroll-area`, `@navecss/base-ui/meter`, `@navecss/base-ui/progress`, `@navecss/base-ui/avatar` and `@navecss/base-ui/separator`. `Separator` is the separator the Toolbar already uses and needs nothing more.

### Toast

Toast needs one `Toast.Provider` around both the code that raises toasts and the place they appear, and you render the toasts yourself: map the `toasts` from `Toast.useToastManager()` to one `Toast.Root` each, inside `Toast.Viewport`, inside `Toast.Portal`. To raise a toast from outside React, create a manager with `Toast.createToastManager()`, pass it to the provider's `toastManager` prop and call its `add` method.

```tsx
'use client'
import type { ReactNode } from 'react'
import { Toast } from '@navecss/base-ui/toast'

export const toastManager = Toast.createToastManager()

function Toasts() {
  const { toasts } = Toast.useToastManager()
  return (
    <>
      {toasts.map((toast) => (
        <Toast.Root key={toast.id} toast={toast}>
          <Toast.Title />
          <Toast.Description />
          <Toast.Close>Dismiss</Toast.Close>
        </Toast.Root>
      ))}
    </>
  )
}

export default function ToastArea({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider toastManager={toastManager}>
      {children}
      <Toast.Portal>
        <Toast.Viewport>
          <Toasts />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  )
}
```

`toastManager.add({ title: 'Saved', description: 'Your changes were saved.' })` then raises a toast from anywhere in your app.

Call `Toast.createToastManager()` in a module that starts with `'use client'`, as in the example, and import the manager from that module.

`Toast.Title` renders an `<h2>`. Pass `render` to use another element.

While a toast is open, pressing F6 moves keyboard focus to the region that holds the toasts, and Tab moves on into them. This is Base UI's behaviour; Nave's styles add none.

A toast closes on its own after its `timeout`, 5000 milliseconds unless you set another on the toast or on the provider. Base UI pauses that timer while the pointer is over the toasts, while keyboard focus is in them and while the window is in the background. A toast whose `timeout` is `0` stays until it is closed, which suits a toast that carries an action the reader needs.

If a toast holds a control that opens a popover, menu or other popup, give that toast a `timeout` of `0`. When keyboard focus moves into a popup rendered outside the toast area, Base UI resumes the toast's timer, so the toast can close while the popup is open, and keyboard focus is then lost.

When more toasts are open than the provider's `limit` (three unless you set it), Base UI keeps the oldest ones on the page but makes them inert, and Nave hides them. Each one comes back when a newer toast closes, unless its own timer runs out first, because a hidden toast's timer keeps running.

Nave fixes the toasts to a bottom corner of the window, above Nave's dialogs and other popups, and an anchored toast, which Base UI places beside its anchor, sits at that same level. So a toast can cover part of your page, a popup or an open dialog, including the control that has keyboard focus. If your page, popups or dialogs can put controls where toasts appear, move the toasts with your own CSS, or move an anchored toast with the `side`, `align` and `sideOffset` of its `Toast.Positioner`.

A popover, menu or tooltip opened from a toast opens under the other toasts where they overlap, unless you pass the toast viewport to its `Portal` as `container`. It then renders inside the region Base UI uses to announce toasts.

Nave paints every toast alike, whatever its `type`. Say what kind of message it is in its title or description.

Base UI moves a toast under the pointer while it is being swiped away, whatever Nave's styles and the reduced-motion setting say; `swipeDirection={[]}` on `Toast.Root` turns swiping off.

### Navigation Menu

A Navigation Menu is a `NavigationMenu.List` of `NavigationMenu.Item`s, each holding either a `NavigationMenu.Trigger` with its `NavigationMenu.Content`, or a single `NavigationMenu.Link`. The open item's content appears in one `NavigationMenu.Popup`, which you render once, after the list, through `NavigationMenu.Portal` and `NavigationMenu.Positioner`, with a `NavigationMenu.Viewport` inside it.

```tsx
import { NavigationMenu } from '@navecss/base-ui/navigation-menu'

export default function SiteNav() {
  return (
    <NavigationMenu.Root>
      <NavigationMenu.List>
        <NavigationMenu.Item>
          <NavigationMenu.Trigger>
            Guides
            <NavigationMenu.Icon>
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <path d="M3 6l5 5 5-5" />
              </svg>
            </NavigationMenu.Icon>
          </NavigationMenu.Trigger>
          <NavigationMenu.Content>
            <NavigationMenu.Link href="/guides/start" active>
              Quick start
            </NavigationMenu.Link>
            <NavigationMenu.Link href="/guides/theming">Theming</NavigationMenu.Link>
          </NavigationMenu.Content>
        </NavigationMenu.Item>
        <NavigationMenu.Item>
          <NavigationMenu.Link href="/blog">Blog</NavigationMenu.Link>
        </NavigationMenu.Item>
      </NavigationMenu.List>
      <NavigationMenu.Portal>
        <NavigationMenu.Positioner>
          <NavigationMenu.Popup>
            <NavigationMenu.Viewport />
          </NavigationMenu.Popup>
        </NavigationMenu.Positioner>
      </NavigationMenu.Portal>
    </NavigationMenu.Root>
  )
}
```

`NavigationMenu.Icon` turns half a turn while its item is open, so put the arrow you want turned inside it.

The panel takes the size of the open item's content, and changes size at once when you move to another item: Nave does not animate it.

Pass `active` to the `NavigationMenu.Link` for the page the reader is on. Base UI then gives it `aria-current="page"`, which marks it as the current page for assistive technology, and Nave gives it a thicker underline than the other links.

Nave removes the bullets from `NavigationMenu.List`. Safari still treats it as a list for screen readers because Base UI renders it inside a `nav` element; if you give the menu's root or popup another element through `render`, add `role="list"` to the list.

Nave does not dim a disabled `NavigationMenu.Trigger` and only withholds its hover fill, because before Base UI 1.6 a disabled trigger still opens its menu on hover. If you disable one, style it yourself.

### Scroll Area

Give `ScrollArea.Root` a height in a class of your own, with `block-size` or `max-block-size`, and its viewport fills it. Render one `ScrollArea.Scrollbar` with a `ScrollArea.Thumb` for each direction that can scroll, and a `ScrollArea.Corner` when both can: Base UI hides the browser's own scrollbars, so a direction without them shows none. Base UI does that with a `<style>` element it renders, so under a Content Security Policy pass your nonce through Base UI's `CSPProvider`. Nave gives the scrollbar and the corner the page's base surface; on a raised panel, set the panel's `background-color` on both with a class of your own.

While its content overflows, a Scroll Area's viewport is a Tab stop, so a keyboard can reach and scroll it. Nave leaves its focus ring to the browser and paints the scrollbars whenever there is something to scroll.

If you pass `keepMounted` to a `ScrollArea.Scrollbar`, it stays on screen over the edge of the content even when there is nothing to scroll in its direction, but Nave makes room for a scrollbar only while its direction can scroll. Give the viewport that room yourself on that edge, as both `padding` and `scroll-padding`: `calc(var(--nave-size-control-xs) + var(--nave-spacing-control-xs))`.

### Meter and Progress

Meter and Progress draw their value as a bar inside an outlined track, in the text colour: set `color` on the `Indicator` to change it. Making the `Track` taller leaves the bar as thick as Nave draws it, centred in the track. To draw it thicker, set the `Indicator`'s `border-block-width` to half the thickness you want and its `max-block-size` to the whole of it, in a class of your own.

Meter and Progress look alike in Nave, but Base UI gives Meter the `meter` role and Progress the `progressbar` role, so choose by meaning: Meter for a measurement within a known range, such as storage used, and Progress for how far a task has got.

An indeterminate Progress (`value={null}`) shows only its empty track: Nave hides the bar, because a full bar would look like a finished task. If you restyle Progress, give the track its height, not the indicator, or an indeterminate bar will fill the track.

### Avatar

`Avatar.Fallback` takes Base UI's `delay` prop, which holds the fallback back for that many milliseconds, so an image that loads quickly does not flash it.

Give `Avatar.Image` an `alt` that names the person, or `alt=""` when their name is written next to it. Until the image loads, or if it fails to load, Base UI shows the fallback in its place, and a screen reader reads the fallback's text instead.

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

In Base UI 1.8.0 and 1.9.0, `Menu.LinkItem` has no disabled state: a `disabled` prop reaches the `<a>` as a plain attribute, the link still activates, and it does not take the disabled colour Nave gives the other menu items.

In Base UI 1.9.0, outside a Toolbar, `Tabs.List`, Radio Group, Toggle Group, Menubar or Navigation Menu, a disabled `Accordion.Trigger` or `Collapsible.Trigger` that renders a `<button>`, as it does by default, is marked with the `disabled` attribute and not `aria-disabled`, so it keeps the colour and pointer cursor of an enabled trigger; if you disable one, style its `:disabled` state yourself.

When the reader's system asks for reduced motion, this package turns off the popups' fade, the tooltip's fade, the backdrop's fade, the toasts' fade, the turn of the icon in Navigation Menu triggers, the tab indicator's slide, the motion of Accordion and Collapsible panels opening and closing, the turn of the icon in their triggers and the switch's slide, even if you have changed Nave's motion tokens. Motion you add or restyle yourself is yours to switch off.

## License

MIT. See [LICENSE](https://github.com/navecss/navecss/blob/main/packages/base-ui/LICENSE).
