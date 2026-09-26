---
name: navecss
description: 'Reference for Nave — the @nave at-rule, cx()/cx.raw(), --nave-* custom
  properties and the @layer order — so an agent applies existing atoms and tokens instead
  of inventing new CSS.'
---

# navecss

An index of Nave’s vocabulary for a coding agent: every built-in atom, every `--nave-*`
custom property, the layer order, and the idiom that applies them. See
[ATOMS.md](../../ATOMS.md) for the same atom table alone, and
[Theming](https://github.com/navecss/navecss/blob/main/README.md#theming) for how a project
changes the seed colour and everything derived from it.

## Using `@nave` and `var(--nave-*)`

Apply built-in atoms with the `@nave` at-rule inside a CSS rule; read values through
`var(--nave-*)`. Both vocabularies are closed sets: the built-in atom names and the
`--nave-*` names are exactly the ones on this page.
An atom name that is neither on this page nor in the project’s own `navePlugin({ extend })`
configuration is not used, and a `--nave-*` name not on this page is not used either:
when the name you need does not exist, say so rather than invent one.
An undeclared `--nave-*` name passes lint and the build and renders nothing.

Atoms a project registers through `navePlugin({ extend })` are not listed on this page.
They are valid in `@nave` only, never in `cx()`, and they live in that project’s own
`navePlugin({ extend })` configuration, so look for them there
(their shape is in [CONSUMER-ATOMS.md](../../CONSUMER-ATOMS.md)).
Where one shares a built-in atom’s name,
`@nave` applies the project’s atom and `cx()` still returns the built-in,
so the declarations this page shows for that name are not what `@nave` applies there.

```css
/* button.module.css */
@layer components.consumer {
  .root {
    @nave interactive focusRing transition;
    background: var(--nave-color-action-primary);
    color: var(--nave-color-on-action-primary);
    padding: var(--nave-spacing-control-md) var(--nave-spacing-control-lg);
    border-radius: var(--nave-radius-control);
  }
}
```

Consumer rules go in `@layer components.consumer`, and a deliberate exception in
`@layer overrides`; never write an unlayered rule. Atom names are the camelCase keys listed
under Atoms below (`focusRing`, `justifyBetween`), never the `nave-` class they emit.

See where `@nave` is valid (nesting depth, `@media`/`@container`, `@keyframes`) in
[the package README](../../README.md#where-nave-is-valid).

## `cx()`

The JavaScript escape hatch: `cx('interactive', 'focusRing')` returns the class of each
built-in atom it names, and `cx()` takes built-in atoms and nothing else.
Its type check is TypeScript only: a JavaScript consumer gets none of it. A type error from
`cx()` means the name is wrong: it is never a reason to reach for `cx.raw()` or a cast.

## `cx.raw()`

`cx.raw()` is for a class from outside any system Nave sees, the project’s own classes
included. Where a project class shares an atom’s name, `cx('container')` is Nave’s atom and
`cx.raw('container')` is the project’s class.

`cx.raw()` is also for a CSS Module class behind a condition, shown by the code span
`cx.raw(isActive && styles.active)`, because a template-literal slot interpolates a falsy
condition’s own value — naming `false`, `undefined` and `0` — as a class.

## Atoms

Every built-in atom: the name as written in `@nave` and `cx()`, the declarations it
applies, and its pseudo-class, `@media` or `@container` variants.
A name not on this list is not a built-in atom.
A project’s own `navePlugin({ extend })` atoms are not listed here (see Using `@nave` above);
a name that is in neither is not used, so do not invent one.

### Display

| Atom          | Declarations             | Variants |
| ------------- | ------------------------ | -------- |
| `flex`        | `display: flex;`         | —        |
| `inlineFlex`  | `display: inline-flex;`  | —        |
| `grid`        | `display: grid;`         | —        |
| `block`       | `display: block;`        | —        |
| `inlineBlock` | `display: inline-block;` | —        |
| `hidden`      | `display: none;`         | —        |

### Flex

| Atom             | Declarations                           | Variants |
| ---------------- | -------------------------------------- | -------- |
| `flexCol`        | `flex-direction: column;`              | —        |
| `flexWrap`       | `flex-wrap: wrap;`                     | —        |
| `itemsCenter`    | `align-items: center;`                 | —        |
| `itemsStart`     | `align-items: flex-start;`             | —        |
| `itemsEnd`       | `align-items: flex-end;`               | —        |
| `justifyCenter`  | `justify-content: center;`             | —        |
| `justifyBetween` | `justify-content: space-between;`      | —        |
| `justifyEnd`     | `justify-content: flex-end;`           | —        |
| `flexGrow`       | `flex-grow: 1;`                        | —        |
| `flexShrink0`    | `flex-shrink: 0;`                      | —        |
| `gap`            | `gap: var(--nave-spacing-content-md);` | —        |

### Position

| Atom        | Declarations          | Variants |
| ----------- | --------------------- | -------- |
| `relative`  | `position: relative;` | —        |
| `absolute`  | `position: absolute;` | —        |
| `insetFull` | `inset: 0;`           | —        |

### Sizing

| Atom    | Declarations    | Variants |
| ------- | --------------- | -------- |
| `wFull` | `width: 100%;`  | —        |
| `hFull` | `height: 100%;` | —        |
| `minW0` | `min-width: 0;` | —        |

### Typography

| Atom              | Declarations                                                                                                                                                                                    | Variants                                                                                                                                                                                                                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `truncate`        | `overflow: hidden;`<br>`text-overflow: ellipsis;`<br>`white-space: nowrap;`                                                                                                                     | —                                                                                                                                                                                                                                                                                                                                         |
| `srOnly`          | `position: absolute;`<br>`width: 1px;`<br>`height: 1px;`<br>`padding: 0;`<br>`margin: -1px;`<br>`overflow: hidden;`<br>`clip-path: inset(50%);`<br>`white-space: nowrap;`<br>`border-width: 0;` | —                                                                                                                                                                                                                                                                                                                                         |
| `srOnlyFocusable` | `position: absolute;`<br>`width: 1px;`<br>`height: 1px;`<br>`padding: 0;`<br>`margin: -1px;`<br>`overflow: hidden;`<br>`clip-path: inset(50%);`<br>`white-space: nowrap;`<br>`border-width: 0;` | `:focus-visible` — `position: static;`<br>`width: auto;`<br>`height: auto;`<br>`margin: 0;`<br>`overflow: visible;`<br>`clip-path: none;`<br>`white-space: normal;`<br>`:focus-within` — `position: static;`<br>`width: auto;`<br>`height: auto;`<br>`margin: 0;`<br>`overflow: visible;`<br>`clip-path: none;`<br>`white-space: normal;` |
| `noWrap`          | `white-space: nowrap;`                                                                                                                                                                          | —                                                                                                                                                                                                                                                                                                                                         |
| `breakWord`       | `overflow-wrap: break-word;`                                                                                                                                                                    | —                                                                                                                                                                                                                                                                                                                                         |
| `textLeft`        | `text-align: left;`                                                                                                                                                                             | —                                                                                                                                                                                                                                                                                                                                         |
| `textCenter`      | `text-align: center;`                                                                                                                                                                           | —                                                                                                                                                                                                                                                                                                                                         |
| `textRight`       | `text-align: right;`                                                                                                                                                                            | —                                                                                                                                                                                                                                                                                                                                         |

### Interaction

| Atom            | Declarations                                                                                                              | Variants                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `interactive`   | `cursor: pointer;`<br>`-webkit-user-select: none;`<br>`user-select: none;`<br>`-webkit-tap-highlight-color: transparent;` | —                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `focusRing`     | `outline: none;`                                                                                                          | `:focus-visible` — `outline: var(--nave-border-width-focus) solid var(--nave-color-border-focus);`<br>`outline-offset: 2px;`                                                                                                                                                                                                                                                                                                                                   |
| `disabledState` | —                                                                                                                         | `:disabled, [aria-disabled="true"]` — `color: var(--nave-color-content-disabled);`<br>`border-color: var(--nave-color-border-disabled);`<br>`pointer-events: none;`<br>On the aria-disabled branch the element stays focusable by design: this atom only blocks pointer activation (pointer-events: none), so the component's own activation handler must also check the attribute and no-op on Enter and Space, since CSS cannot prevent keyboard activation. |

### Visual

| Atom             | Declarations                                                                  | Variants |
| ---------------- | ----------------------------------------------------------------------------- | -------- |
| `rounded`        | `border-radius: var(--nave-radius-control);`                                  | —        |
| `roundedCard`    | `border-radius: var(--nave-radius-card);`                                     | —        |
| `roundedFull`    | `border-radius: var(--nave-radius-full);`                                     | —        |
| `border`         | `border: var(--nave-border-width-sm) solid var(--nave-color-border-default);` | —        |
| `overflowHidden` | `overflow: hidden;`                                                           | —        |
| `overflowAuto`   | `overflow: auto;`                                                             | —        |

### Transition

| Atom         | Declarations                                                                                                                                                                                                        | Variants |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `transition` | `transition-property: color, background-color, border-color, opacity, box-shadow;`<br>`transition-duration: var(--nave-motion-duration-base);`<br>`transition-timing-function: var(--nave-motion-easing-standard);` | —        |

### Containment

| Atom        | Declarations                   | Variants |
| ----------- | ------------------------------ | -------- |
| `container` | `container-type: inline-size;` | —        |

### Responsive

| Atom                    | Declarations | Variants                                              |
| ----------------------- | ------------ | ----------------------------------------------------- |
| `hidePhoneOnly`         | —            | `@media (width < 37.5em)` — `display: none;`          |
| `hideTabletPortraitUp`  | —            | `@media (width >= 37.5em)` — `display: none;`         |
| `hideTabletLandscapeUp` | —            | `@media (width >= 56.25em)` — `display: none;`        |
| `hideDesktopUp`         | —            | `@media (width >= 75em)` — `display: none;`           |
| `stackPhoneOnly`        | —            | `@media (width < 37.5em)` — `flex-direction: column;` |
| `wFullPhoneOnly`        | —            | `@media (width < 37.5em)` — `width: 100%;`            |

## Custom properties

Every `--nave-*` custom property Nave declares, with its description where one exists. A
name not on this list is not declared — an undeclared `--nave-*` name passes the build and
renders nothing.

- `--nave-border-width-focus`: Focus ring indicator outline width
- `--nave-border-width-lg`
- `--nave-border-width-none`
- `--nave-border-width-sm`: Default border / divider
- `--nave-color-action-primary`
- `--nave-color-action-primary-active`
- `--nave-color-action-primary-hover`
- `--nave-color-action-secondary`
- `--nave-color-border-control`: Identifying boundary for a control (inputs, form boundaries, and the secondary action control).
- `--nave-color-border-default`: Decorative dividers and card edges.
- `--nave-color-border-disabled`
- `--nave-color-border-focus`
- `--nave-color-border-strong`
- `--nave-color-content-disabled`: Text inside a disabled interactive component.
- `--nave-color-content-inverse`: Declared foreground for surface.inverse.
- `--nave-color-content-link`: Do not distinguish a link by colour alone. Nave's own examples keep a non-colour distinction wherever this token is shown.
- `--nave-color-content-primary`
- `--nave-color-content-secondary`
- `--nave-color-content-tertiary`: Placeholder and hint text only.
- `--nave-color-feedback-danger`: Solid-background role for a destructive control or error state.
- `--nave-color-feedback-danger-foreground`: Foreground role for danger text and icons.
- `--nave-color-feedback-info`: Alias of feedback.warning (shared tinted-neutral family).
- `--nave-color-feedback-info-foreground`
- `--nave-color-feedback-success`: Alias of feedback.warning (shared tinted-neutral family).
- `--nave-color-feedback-success-foreground`
- `--nave-color-feedback-warning`: Solid-background role for a warning state (shared tinted-neutral family).
- `--nave-color-feedback-warning-foreground`: Foreground role for warning text and icons.
- `--nave-color-on-action-primary`
- `--nave-color-on-feedback-danger`: Declared foreground for the solid feedback.danger background.
- `--nave-color-on-feedback-info`
- `--nave-color-on-feedback-success`
- `--nave-color-on-feedback-warning`
- `--nave-color-surface-base`
- `--nave-color-surface-inverse`
- `--nave-color-surface-overlay`
- `--nave-color-surface-raised`
- `--nave-color-surface-sunken`
- `--nave-color-tint`
- `--nave-font-family-base`: Body / UI typeface
- `--nave-font-family-display`: Heading typeface — swap for a display font when ready
- `--nave-font-family-mono`: Code / monospace typeface
- `--nave-font-size-2xl`
- `--nave-font-size-3xl`
- `--nave-font-size-4xl`
- `--nave-font-size-lg`
- `--nave-font-size-md`: Base body size (16px default)
- `--nave-font-size-sm`
- `--nave-font-size-xl`
- `--nave-font-size-xs`
- `--nave-font-weight-bold`
- `--nave-font-weight-medium`
- `--nave-font-weight-regular`
- `--nave-font-weight-semibold`
- `--nave-layer-base`: Default document flow
- `--nave-layer-dropdown`: Dropdowns, context menus, select panels
- `--nave-layer-modal`: Modal dialogs and drawers
- `--nave-layer-overlay`: Backdrop overlays behind modals
- `--nave-layer-sticky`: Sticky headers, floating toolbars
- `--nave-layer-toast`: Toast notifications and snackbars
- `--nave-layer-tooltip`: Tooltips — always on top of everything
- `--nave-letter-spacing-normal`: Default — no adjustment
- `--nave-letter-spacing-tight`: Large headings and display text
- `--nave-letter-spacing-wide`: Uppercase labels, small caps
- `--nave-line-height-base`: Default body line height
- `--nave-line-height-loose`
- `--nave-line-height-none`: Single-line / icon buttons — no extra leading
- `--nave-line-height-relaxed`
- `--nave-line-height-snug`
- `--nave-line-height-tight`: Headings
- `--nave-motion-duration-base`: Default state transitions: hover, focus
- `--nave-motion-duration-fast`: Micro-interactions: tooltips, badges
- `--nave-motion-duration-instant`: No animation — kept at 0ms even under prefers-reduced-motion
- `--nave-motion-duration-slow`: Layout shifts: accordion, drawer
- `--nave-motion-easing-accelerate`: Elements leaving the screen
- `--nave-motion-easing-decelerate`: Elements entering the screen
- `--nave-motion-easing-standard`: General-purpose — enters and exits
- `--nave-opacity-disabled`: Opacity multiplier for muting content that is inert and contains nothing focusable (e.g. a disabled icon or illustration). Nave's own interactive-disabled state is expressed through content.disabled and border.disabled instead, not this token: opacity composites everything an element paints, including a focus indicator inside it.
- `--nave-radius-card`: Cards, panels, dialogs
- `--nave-radius-control`: Inputs, buttons, tags
- `--nave-radius-full`: Pill / badge shape
- `--nave-radius-none`
- `--nave-radius-overlay`: Modals, drawers, sheets
- `--nave-radius-sm`
- `--nave-shadow-modal`: Dialogs and modals — highest elevation
- `--nave-shadow-none`: No elevation
- `--nave-shadow-overlay`: Popovers, dropdowns, floating elements
- `--nave-shadow-raised`: Cards, slight elevation above base
- `--nave-size-avatar-lg`
- `--nave-size-avatar-md`
- `--nave-size-avatar-sm`
- `--nave-size-control-lg`: Large controls
- `--nave-size-control-md`: Default control height
- `--nave-size-control-sm`: Small controls
- `--nave-size-control-xs`: Compact/dense controls
- `--nave-size-icon-lg`
- `--nave-size-icon-md`: Default inline icon
- `--nave-size-icon-sm`
- `--nave-size-icon-xl`
- `--nave-size-icon-xs`
- `--nave-spacing-content-lg`
- `--nave-spacing-content-md`: Default component gap and padding
- `--nave-spacing-content-sm`
- `--nave-spacing-content-xl`
- `--nave-spacing-content-xs`
- `--nave-spacing-control-lg`
- `--nave-spacing-control-md`
- `--nave-spacing-control-sm`: No matching _primitive.space rung; authored directly
- `--nave-spacing-control-xs`
- `--nave-spacing-layout-lg`
- `--nave-spacing-layout-md`
- `--nave-spacing-layout-sm`
- `--nave-spacing-layout-xs`

## Layers

Nave’s layer order: `@layer tokens.defaults, tokens.presets, reset, atomic, components.nave, components.consumer, overrides;`

The order holds only if it is the first `@layer` declaration the page sees:
a stylesheet that declares a layer and loads earlier fixes that layer’s position first,
and the order inverts with no error.
So keep `@navecss/core/layers`, the order statement alone, as the first import of the
entry stylesheet, and load that stylesheet before anything that brings its own stylesheet,
components included.

Your own component CSS goes in `@layer components.consumer`; a deliberate exception goes in
`@layer overrides`, which beats every other layer. A rule left outside any layer beats them
all, `overrides` included, so never write unlayered CSS.
That is the order for normal declarations. `!important` reverses it: an `!important` in
`overrides` loses to one in any earlier layer, Nave’s reset included, and one outside any
layer loses to every layered one.
