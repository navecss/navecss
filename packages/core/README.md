# @navecss/core

> Layer architecture, reset, atomic utilities, and PostCSS plugin for Nave.

## Installation

```bash
pnpm add @navecss/core
```

## Requirements

- **Browsers: Chrome and Edge 125, Firefox 128, Safari 18 (Baseline 2024).**
  Every semantic colour in Nave's token stylesheet is a `light-dark()` pair, and
  most of them are also derived with relative colour syntax. An older browser
  drops whichever of them it does not support, without an error: surfaces and
  text lose their colours. Your CSS build has to target the same floor, and
  [PostCSS plugin setup](#postcss-plugin-setup) has the line for Vite.
  [Why this floor](https://github.com/navecss/navecss/blob/main/docs/04-adr/0005-browser-floor.md).
- **A resolver that reads `exports` maps.** Every entry point, the stylesheet
  included, is reachable only through the package's `exports` map: there is no
  `main` field to fall back on.
- **ES modules.** `@navecss/core/cx`, `@navecss/core/atoms` and
  `@navecss/core/postcss` load through `import` only. A `require()` of any of
  them fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`, which reads as though the
  entry point did not exist. In TypeScript, set `moduleResolution` to `bundler`,
  `node16` or `nodenext`; under `node10` their types are not found. A CommonJS
  file type-checks against them and then fails when it runs, so import them from
  an ES module.
- **Node 22.18 or later.**
- **PostCSS 8, for `@nave` only.** `postcss` is an optional peer dependency, so
  nothing installs it for you: add it yourself if you use `@nave`. Without it,
  importing `@navecss/core/postcss` fails with `Cannot find package 'postcss'`.
  The stylesheets and `cx()` need no PostCSS.

## Setup

Import once at your app entry point:

```css
/* app.css */
@import url('@navecss/core/layers');
@import url('@navecss/core');
```

This imports the full layer stack in the correct order:
`tokens.defaults → tokens.presets → reset → atomic → components.nave → components.consumer → overrides`

The order holds only if it is the first `@layer` declaration your page sees:
a stylesheet of yours that declares a layer and loads earlier fixes that
layer's position first, and the order inverts with no error. So keep
`@navecss/core/layers`, the order statement alone, as the first line of
`app.css`, and import `app.css` in your entry file before anything that brings
its own stylesheet, components included. The `@navecss/core` import after it
repeats the same statement, which changes nothing
([why, and where your CSS goes](https://github.com/navecss/navecss/blob/main/docs/04-adr/0003-layer-cascade-contract.md)).

Your component CSS goes in `@layer components.consumer`, and a deliberate
exception goes in `@layer overrides`, which beats every other layer. Left outside
any layer, your CSS would beat all of them, `overrides` included. Do not write
into a bare `@layer components` or `@layer tokens`: a rule written directly into a
layer outranks everything in that layer's sublayers.

---

## Styling components

Nave gives you three ways to apply atomic utilities. Start with @nave directives.
Every built-in atom, with the declarations it applies, is listed in
[ATOMS.md](./ATOMS.md).

### Primary — @nave directives

Requires the PostCSS plugin. Everything stays in CSS files.

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

Declarations are inlined at build time, and nothing of `@nave` is left at run time.
Pseudo-class rules (`:focus-visible` from `focusRing`), `@media` and
`@container` blocks are emitted as native CSS nesting inside your rule, so they
apply to every selector in a selector list. Native nesting is inside the browser
floor under [Requirements](#requirements).

### Escape hatch — cx() utility

No PostCSS required. Atom names move to JSX — autocompleted, and type-checked.

```tsx
import { cx } from '@navecss/core/cx'
import styles from './button.module.css'

;<button className={`${cx('interactive', 'focusRing', 'transition')} ${styles.root}`} />
```

Use this if you cannot or do not want to add a PostCSS plugin to your build.

A `cx()` class is a default, not an override: it sits in the `atomic` layer,
below your component CSS, so your own rule wins wherever the two set the same
property.

Two channels, because they carry different things. `cx()` takes Nave's built-in
atoms and nothing else. Your own classes compose in the template literal, the
way your own declarations sit beside `@nave` in a rule body. `cx.raw()` is for a
class from outside any system Nave can see — a legacy global class, a
third-party widget's class — and it returns what you give it, untouched:

```tsx
;<div className={`${cx('interactive')} ${cx.raw('legacy-card')}`} />
```

**A conditional class goes in a call, not in a slot.** Both channels filter
falsy arguments, so `cx('interactive', isActive && 'focusRing')` and
`cx.raw(isActive && styles.active)` each drop the argument when the condition
is false. A template-literal slot does not: `${isActive && styles.active}`
interpolates the string `false`, and an undefined one interpolates `undefined`.

What that buys you, and what it does not:

- **An unknown name is a compile error**, in your own `tsc`, with nothing
  installed from us. That covers a typo (`cx('interactve')`), a name typed
  from the CSS side (`cx('sr-only')` — the atom is `srOnly`, and the class it
  _emits_ is `nave-sr-only`; neither spelling is the key), and any class that is
  not a Nave atom. **TypeScript only:
  a JavaScript consumer gets none of it.** For a build-level check that does not
  depend on types, use the `@nave` directive with `navePlugin()` — it fails the
  build on an unknown atom by default.
- **`cx.raw()` cannot shadow one of your classes.** It never consults the atom
  map, so `cx.raw('container')` is the literal `container`. Inside `cx()` an
  atom name still resolves to that atom's global class — `cx('container')` is
  `nave-container` — which is why the ordinary-sounding names (`container`,
  `hidden`, `grid`, `flex`, `block`, `border`, `rounded`, `transition`,
  `relative`, `absolute`, `gap`, `truncate`, `interactive`) belong on the
  `cx.raw()` side when you mean your own.
- **Nothing checks the rest of the `className` attribute.** A bare
  `'legacy-card'` sitting beside these calls is seen by nothing and still works.
  So `cx.raw()` is a **declared** escape channel, not an enforced one: its value
  today is that every deliberate step outside the system leaves a token you can
  find (`grep -r 'cx.raw'`). A lint that closes the attribute itself is not part
  of this release.

### Tokens only

For library authors or teams building on top of Base UI or Radix UI.
CSS custom properties are always available — no atomic layer required.

```css
.root {
  background: var(--nave-color-action-primary);
  border-radius: var(--nave-radius-control);
  transition-duration: var(--nave-motion-duration-base);
}
```

Every custom property Nave declares is in the stylesheet you already installed, at `@navecss/tokens/css`.

---

## PostCSS plugin setup

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { navePlugin } from '@navecss/core/postcss'

export default defineConfig({
  // your existing options, plugins included, stay as they are
  css: { postcss: { plugins: [navePlugin()] } },
  build: { cssTarget: ['chrome125', 'edge125', 'firefox128', 'safari18', 'ios18'] },
})
```

`build.cssTarget` is the browser floor, in Vite's terms. Vite's default targets
older browsers, and building for them gains you nothing, because the output
still needs the floor. It does cost you something: Vite rewrites `light-dark()`
in Nave's colours into an emulation that a `color-scheme` set from script, or on
part of the page, does not switch. If your project already has a
`postcss.config.js`, put `navePlugin()` there instead: Vite reads no PostCSS
config file once `css.postcss` is set inline.

```js
// postcss.config.js
import { navePlugin } from '@navecss/core/postcss'

export default {
  plugins: [navePlugin()],
}
```

### Options

```ts
navePlugin({
  // 'error' (default) — throw, failing the build
  // 'warn'            — log and skip
  // 'ignore'          — silently skip
  onUnknown: 'error',
})
```

To add atoms of your own to `@nave`, pass them as `extend`: see
[CONSUMER-ATOMS.md](./CONSUMER-ATOMS.md).

`postcss` is an optional peer dependency.
If you are using only `cx()` or tokens, you do not need to install it.

**If your Vite config sets `css.transformer: 'lightningcss'`, this plugin never
runs.** That option replaces Vite's CSS pipeline with Lightning CSS, which does
not run PostCSS plugins at all: the build stays green, `@nave` reaches the
browser as an unknown at-rule, and the browser drops it, so the rule renders
with none of the declarations its atoms were going to give it. Leave the
default transformer in place on a project using `@nave`.

### Plugin order

Put `navePlugin()` before any autoprefixing or syntax-down-levelling plugin (`autoprefixer`,
`postcss-preset-env`, and the like) in your `plugins` array. `navePlugin()` resolves `@nave`
directives into literal declarations; a prefixer ordered before it only ever sees the
unexpanded directive, so it has nothing of Nave's to add a prefix to. Nave's own atoms already
ship the vendor-prefixed properties their declarations need (`interactive`'s
`-webkit-user-select` alongside `user-select`, for one), so this is only a concern for your own
CSS sharing the same pipeline.

### Where `@nave` is valid

`@nave` must be the direct child of a CSS rule selector block. Any rule will
do and the nesting depth does not matter, so `.card { @nave flex; }`,
`.card { &:hover { @nave flex; } }`, `.card { .badge { @nave flex; } }` and
`@supports (display: grid) { .card { @nave flex; } }` are all valid. Two
shapes that parse without error are still rejected, through the same
`onUnknown` option as an unknown atom name (so the default is a build
failure, not a silently incomplete build):

- **Nested inside `@media` or `@container` with no rule in between** —
  `.card { @media (width >= 37.5em) { @nave flex; } }`. Write the directive
  inside a rule instead: `.card { @media (width >= 37.5em) { & { @nave flex; } } }`.
- **Inside `@keyframes`** — a keyframe step (`to`, `from`, `50%`) parses as a
  rule, but `&` has no meaning there and a browser drops the nesting with no
  other symptom, so it is rejected the same way.

---

## Exports

| Export                    | Description                                                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------- |
| `@navecss/core`           | CSS entry point — `@import url('@navecss/core')`                                                      |
| `@navecss/core/layers`    | The `@layer` order statement alone. Import it first, before any other stylesheet                      |
| `@navecss/core/no-tokens` | Entry point for projects that generate their own Nave token layer; see the header comment in the file |
| `@navecss/core/reset`     | Reset stylesheet only. It reads Nave's custom properties, so it needs a token layer beside it         |
| `@navecss/core/atomic`    | Generated atomic CSS (global `nave-` classes)                                                         |
| `@navecss/core/cx`        | `cx()` / `cx.raw()` utilities + `AtomName` type                                                       |
| `@navecss/core/atoms`     | Atom definitions + `atomClassMap`                                                                     |
| `@navecss/core/postcss`   | PostCSS plugin — `navePlugin()`                                                                       |
