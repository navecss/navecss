# ATOMS.md

Generated from `src/atoms.ts`; do not edit by hand.

Every built-in atom Nave ships: the name as written in `@nave` and `cx()`, the global class
it emits, the declarations it applies, and its pseudo-class, `@media` or `@container`
variants, if any.

## Display

| Atom          | Class               | Declarations             | Variants |
| ------------- | ------------------- | ------------------------ | -------- |
| `flex`        | `nave-flex`         | `display: flex;`         | —        |
| `inlineFlex`  | `nave-inline-flex`  | `display: inline-flex;`  | —        |
| `grid`        | `nave-grid`         | `display: grid;`         | —        |
| `block`       | `nave-block`        | `display: block;`        | —        |
| `inlineBlock` | `nave-inline-block` | `display: inline-block;` | —        |
| `hidden`      | `nave-hidden`       | `display: none;`         | —        |

## Flex

| Atom             | Class                  | Declarations                           | Variants |
| ---------------- | ---------------------- | -------------------------------------- | -------- |
| `flexCol`        | `nave-flex-col`        | `flex-direction: column;`              | —        |
| `flexWrap`       | `nave-flex-wrap`       | `flex-wrap: wrap;`                     | —        |
| `itemsCenter`    | `nave-items-center`    | `align-items: center;`                 | —        |
| `itemsStart`     | `nave-items-start`     | `align-items: flex-start;`             | —        |
| `itemsEnd`       | `nave-items-end`       | `align-items: flex-end;`               | —        |
| `justifyCenter`  | `nave-justify-center`  | `justify-content: center;`             | —        |
| `justifyBetween` | `nave-justify-between` | `justify-content: space-between;`      | —        |
| `justifyEnd`     | `nave-justify-end`     | `justify-content: flex-end;`           | —        |
| `flexGrow`       | `nave-flex-grow`       | `flex-grow: 1;`                        | —        |
| `flexShrink0`    | `nave-flex-shrink0`    | `flex-shrink: 0;`                      | —        |
| `gap`            | `nave-gap`             | `gap: var(--nave-spacing-content-md);` | —        |

## Position

| Atom        | Class             | Declarations          | Variants |
| ----------- | ----------------- | --------------------- | -------- |
| `relative`  | `nave-relative`   | `position: relative;` | —        |
| `absolute`  | `nave-absolute`   | `position: absolute;` | —        |
| `insetFull` | `nave-inset-full` | `inset: 0;`           | —        |

## Sizing

| Atom    | Class         | Declarations    | Variants |
| ------- | ------------- | --------------- | -------- |
| `wFull` | `nave-w-full` | `width: 100%;`  | —        |
| `hFull` | `nave-h-full` | `height: 100%;` | —        |
| `minW0` | `nave-min-w0` | `min-width: 0;` | —        |

## Typography

| Atom              | Class                    | Declarations                                                                                                                                                                                    | Variants                                                                                                                                                                                                                                                                                                                                  |
| ----------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `truncate`        | `nave-truncate`          | `overflow: hidden;`<br>`text-overflow: ellipsis;`<br>`white-space: nowrap;`                                                                                                                     | —                                                                                                                                                                                                                                                                                                                                         |
| `srOnly`          | `nave-sr-only`           | `position: absolute;`<br>`width: 1px;`<br>`height: 1px;`<br>`padding: 0;`<br>`margin: -1px;`<br>`overflow: hidden;`<br>`clip-path: inset(50%);`<br>`white-space: nowrap;`<br>`border-width: 0;` | —                                                                                                                                                                                                                                                                                                                                         |
| `srOnlyFocusable` | `nave-sr-only-focusable` | `position: absolute;`<br>`width: 1px;`<br>`height: 1px;`<br>`padding: 0;`<br>`margin: -1px;`<br>`overflow: hidden;`<br>`clip-path: inset(50%);`<br>`white-space: nowrap;`<br>`border-width: 0;` | `:focus-visible` — `position: static;`<br>`width: auto;`<br>`height: auto;`<br>`margin: 0;`<br>`overflow: visible;`<br>`clip-path: none;`<br>`white-space: normal;`<br>`:focus-within` — `position: static;`<br>`width: auto;`<br>`height: auto;`<br>`margin: 0;`<br>`overflow: visible;`<br>`clip-path: none;`<br>`white-space: normal;` |
| `noWrap`          | `nave-no-wrap`           | `white-space: nowrap;`                                                                                                                                                                          | —                                                                                                                                                                                                                                                                                                                                         |
| `breakWord`       | `nave-break-word`        | `overflow-wrap: break-word;`                                                                                                                                                                    | —                                                                                                                                                                                                                                                                                                                                         |
| `textLeft`        | `nave-text-left`         | `text-align: left;`                                                                                                                                                                             | —                                                                                                                                                                                                                                                                                                                                         |
| `textCenter`      | `nave-text-center`       | `text-align: center;`                                                                                                                                                                           | —                                                                                                                                                                                                                                                                                                                                         |
| `textRight`       | `nave-text-right`        | `text-align: right;`                                                                                                                                                                            | —                                                                                                                                                                                                                                                                                                                                         |

## Interaction

| Atom            | Class                 | Declarations                                                                                                              | Variants                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `interactive`   | `nave-interactive`    | `cursor: pointer;`<br>`-webkit-user-select: none;`<br>`user-select: none;`<br>`-webkit-tap-highlight-color: transparent;` | —                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `focusRing`     | `nave-focus-ring`     | `outline: none;`                                                                                                          | `:focus-visible` — `outline: var(--nave-border-width-focus) solid var(--nave-color-border-focus);`<br>`outline-offset: 2px;`                                                                                                                                                                                                                                                                                                                                   |
| `disabledState` | `nave-disabled-state` | —                                                                                                                         | `:disabled, [aria-disabled="true"]` — `color: var(--nave-color-content-disabled);`<br>`border-color: var(--nave-color-border-disabled);`<br>`pointer-events: none;`<br>On the aria-disabled branch the element stays focusable by design: this atom only blocks pointer activation (pointer-events: none), so the component's own activation handler must also check the attribute and no-op on Enter and Space, since CSS cannot prevent keyboard activation. |

## Visual

| Atom             | Class                  | Declarations                                                                  | Variants |
| ---------------- | ---------------------- | ----------------------------------------------------------------------------- | -------- |
| `rounded`        | `nave-rounded`         | `border-radius: var(--nave-radius-control);`                                  | —        |
| `roundedCard`    | `nave-rounded-card`    | `border-radius: var(--nave-radius-card);`                                     | —        |
| `roundedFull`    | `nave-rounded-full`    | `border-radius: var(--nave-radius-full);`                                     | —        |
| `border`         | `nave-border`          | `border: var(--nave-border-width-sm) solid var(--nave-color-border-default);` | —        |
| `overflowHidden` | `nave-overflow-hidden` | `overflow: hidden;`                                                           | —        |
| `overflowAuto`   | `nave-overflow-auto`   | `overflow: auto;`                                                             | —        |

## Transition

| Atom         | Class             | Declarations                                                                                                                                                                                                        | Variants |
| ------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `transition` | `nave-transition` | `transition-property: color, background-color, border-color, opacity, box-shadow;`<br>`transition-duration: var(--nave-motion-duration-base);`<br>`transition-timing-function: var(--nave-motion-easing-standard);` | —        |

## Containment

| Atom        | Class            | Declarations                   | Variants |
| ----------- | ---------------- | ------------------------------ | -------- |
| `container` | `nave-container` | `container-type: inline-size;` | —        |

## Responsive

| Atom                    | Class                           | Declarations | Variants                                              |
| ----------------------- | ------------------------------- | ------------ | ----------------------------------------------------- |
| `hidePhoneOnly`         | `nave-hide-phone-only`          | —            | `@media (width < 37.5em)` — `display: none;`          |
| `hideTabletPortraitUp`  | `nave-hide-tablet-portrait-up`  | —            | `@media (width >= 37.5em)` — `display: none;`         |
| `hideTabletLandscapeUp` | `nave-hide-tablet-landscape-up` | —            | `@media (width >= 56.25em)` — `display: none;`        |
| `hideDesktopUp`         | `nave-hide-desktop-up`          | —            | `@media (width >= 75em)` — `display: none;`           |
| `stackPhoneOnly`        | `nave-stack-phone-only`         | —            | `@media (width < 37.5em)` — `flex-direction: column;` |
| `wFullPhoneOnly`        | `nave-w-full-phone-only`        | —            | `@media (width < 37.5em)` — `width: 100%;`            |

## Pairing notes

- `truncate`: pairs with `minW0` on a flex or grid child, or the text never has a width to truncate against
