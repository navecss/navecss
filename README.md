# NaveCSS

> Your north star for design systems.

Nave is a standards-first CSS design system library for teams that treat
CSS as a first-class engineering concern.

Built on web standards. Zero runtime.

On this page:

- [Philosophy](#philosophy)
- [Packages](#packages)
- [Who this is for](#who-this-is-for)
- [Quick start](#quick-start)
- [Getting started](#getting-started)
- [Theming](#theming)
- [Accessibility](#accessibility)
- [Stability and maintenance](#stability-and-maintenance)
- [License](#license)
- [Brand and name](#brand-and-name)

## Philosophy

Most CSS libraries make a tradeoff: utility classes in markup (Tailwind),
styles written in JavaScript (StyleX), or a component library that owns
your styles (MUI, Chakra).

Nave takes a different path:

- **Tokens** define your design language, in DTCG 2025.10 format
- **`@layer`** controls the cascade — no specificity conflicts, as long as
  Nave's layer order is the first one your page declares
  ([why, and where your CSS goes](docs/04-adr/0003-layer-cascade-contract.md))
- **`@nave` directives** apply atomic utilities inside CSS files, not in markup
- **Headless components** (Base UI, Radix) handle behaviour — Nave handles style

Markup stays semantic. CSS stays in CSS files.
Design tokens are the single source of truth from Figma to production.

Tokens are authored to the Design Tokens Format Module 2025.10, a Final
Community Group Report published on 28 October 2025. It is a community
specification rather than a standards-track one, and Nave implements it
without claiming conformance, certification or endorsement.

## Packages

| Package           | Description                                                 |
| ----------------- | ----------------------------------------------------------- |
| `@navecss/tokens` | DTCG 2025.10 token source + first-party build pipeline      |
| `@navecss/core`   | Layer architecture, reset, atomic utilities, PostCSS plugin |

## Who this is for

Nave is built for senior engineers building serious design systems —
teams that want a principled foundation, not a component library to configure.

If you want hundreds of ready-made components, this is not that.
If you want the best possible base layer for your own system, read on.

## Quick start

**What this needs from your browser and your toolchain.**

**Browsers: Chrome and Edge 125, Firefox 128, Safari 18 (Baseline 2024).**
Every semantic colour in Nave's token stylesheet is a `light-dark()` pair, and
most of them are also derived with relative colour syntax. An older browser
drops whichever of them it does not support, without an error: surfaces and
text lose their colours. [Why this floor](docs/04-adr/0005-browser-floor.md).

**A CSS resolver that reads `exports` maps.** `@navecss/core` publishes one and
no legacy fallback field, so a resolver that reads only the older fields cannot
find it at all. The Vite setup below is one that does.

**A PostCSS pipeline, for the `@nave` directive.** That is what the plugin below
is for: `@nave` is resolved at build time and nothing of it is left at run time.
Without a PostCSS pipeline `@nave` is an unknown at-rule, nothing errors, and
the rule renders with none of the declarations its atoms were going to give it.
The other tier needs no PostCSS at all: `cx()` composes the same built-in atoms
from JavaScript. Add `navecss-core check` to your build script to fail that
build instead of shipping it.

**Vite's `css.transformer: 'lightningcss'` option produces this same symptom
with your PostCSS config still in place.** Setting it replaces Vite's CSS
pipeline with Lightning CSS, which does not run PostCSS plugins at all: the
build stays green, `@nave` reaches the browser as an unknown at-rule, and the
browser drops it, so the rule renders with none of the declarations its atoms
were going to give it. Same failure as the paragraph above, different cause.
Do not set that option on a project using `@nave`.

**One line for your editor and one for your linter**, because `@nave` is an
unknown at-rule to those too. In `.vscode/settings.json`:

```json
{ "css.lint.unknownAtRules": "ignore" }
```

And, if you run stylelint, in your stylelint config:

```json
{ "rules": { "at-rule-no-unknown": [true, { "ignoreAtRules": ["nave"] }] } }
```

Then:

```bash
pnpm add @navecss/core
```

```css
/* app.css */
@import url('@navecss/core/layers');
@import url('@navecss/core');
```

Import `app.css` in your entry file before anything that brings its own
stylesheet, components included, and keep `@navecss/core/layers`, Nave's
`@layer` order statement alone, as its first line: the order holds only if it is
the first `@layer` declaration your page sees. The `@navecss/core` import after
it repeats the same statement, which changes nothing.

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

```css
/* button.module.css */
@layer components.consumer {
  .root {
    @nave interactive focusRing transition;
    background: var(--nave-color-action-primary);
    padding: var(--nave-spacing-control-md) var(--nave-spacing-control-lg);
    border-radius: var(--nave-radius-control);
  }
}
```

Your component CSS goes in `@layer components.consumer`, and a deliberate
exception goes in `@layer overrides`, which beats every other layer. Left outside
any layer, your CSS would beat all of them, `overrides` included. Do not write
into a bare `@layer components` or `@layer tokens`: a rule written directly into a
layer outranks everything in that layer's sublayers.

`@nave` takes Nave's atoms, which are mostly layout and behaviour: display, flex
and grid, position, overflow, text wrapping, focus and interaction, and a few
shapes. Colour, spacing and type come from the tokens, written as ordinary
declarations beside the directive, as above. Both are listed in full:
[the atoms](packages/core/ATOMS.md) and [the tokens](packages/tokens/TOKENS.md).

## Getting started

That is the whole install. What you have now is Nave's defaults: a full colour
system, spacing, radii and type, all of it generated, with nothing written by
you and nothing to configure.

Both colour schemes come with it. The token layer sets `color-scheme: light dark`
on the root element, so the page follows whichever scheme the browser prefers,
usually the operating system's. To pin one, or to switch with a control of your
own, set `color-scheme` on the root element:

```css
/* app.css, after the Nave import */
@layer overrides {
  :root[data-scheme='light'] {
    color-scheme: light;
  }

  :root[data-scheme='dark'] {
    color-scheme: dark;
  }
}
```

Your script sets `data-scheme` on `<html>`. With no attribute, the browser's
preference applies.

When you want it to be your colour instead, you give Nave your brand colour and
it regenerates everything from it. The colours you have now came with
`@navecss/core`; the build that regenerates them is its own package, so add it
once:

```bash
pnpm add -D @navecss/tokens
```

Then one script:

```json
{
  "scripts": {
    "tokens": "navecss-tokens build --seed=#2f6feb --out=src/styles/nave"
  }
}
```

```bash
pnpm run tokens
```

Your surfaces, your accents and your states are regenerated from that one
colour, and the build writes the output for you to commit. The seed lives in the
script rather than in your shell history, so the next person to run it gets the
same system you did.

Then point your app at what you just built, in place of the import you started
with:

```css
/* app.css */
@import url('@navecss/core/no-tokens');
@import url('./styles/nave/tokens.css');
```

`@navecss/core/no-tokens` is the same stylesheet without its token layer, so your
file is the only one declaring Nave's custom properties. Until you make this
swap the build has run, the output is on disk, and the page still renders our
colours. Restart your dev server after the swap: a running one can keep serving
the old token layer through reloads.

There is more than one way to customize, and they differ by how much of Nave's
generation you keep: see [Theming](#theming).

## Theming

Nave generates its colour system rather than shipping a fixed palette, so
customizing it is a question of how much of that generation you keep. The ladder
below is ordered by exactly that, from keeping all of it to keeping only the
contract. Effort and blast radius pull in opposite directions, so neither of them
orders this list. Rung 4 is the one place a second measure decides the order:
what it gives up is not generation but a stable input shape, which is why it
sits below rung 3 rather than above it.

| rung | the situation, in your words              | what you keep                                                                          | where it lives                              |
| ---- | ----------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------- |
| 0    | "Just give me something that looks good." | everything, generated ahead of time from a seed we chose                               | a preset stylesheet import                  |
| 1a   | "Warm our greys up."                      | everything; the neutral surface re-hues live, the accent does not move                 | a CSS block in your app                     |
| 1b   | "Our brand colour is this."               | everything, generated from your seed                                                   | one build command, output committed         |
| 2    | "Our danger red is the corporate red."    | generation, minus one role's link to it                                                | a CSS block in your app                     |
| 3    | "Step 500 is muddy in our brand."         | generation, minus one rung of one ramp                                                 | a JSON file in your repo                    |
| 4    | "Our build system runs Nave's build."     | everything Nave generates, the ramp included; what you give up is a stable input shape | your own build's configuration in your repo |
| 5    | "We have our own token source."           | the required core contract only                                                        | your repo                                   |

Two of these need no build at all: rung 1a and rung 2 are CSS you write, because
the surface Nave emits into the browser is one input plus the semantic slots.
Every other rung runs the generator, and what decides that is whose inputs it
runs on, not whether generation happens. **The token values come with
`@navecss/core`; the generator is a package you add.** Rungs 0, 1a and 2 need
nothing beyond the install you already did. Rungs 1b, 3, 4 and 5 run
`navecss-tokens`, which lives in `@navecss/tokens`; add it to your project once
and every invocation below works:

```bash
pnpm add -D @navecss/tokens
```

### Rung 0: a preset

**Reserved in 0.1.0, and 0.1.0 ships no presets.** The shape exists so that
presets have a home and a defined place in the cascade when they arrive. This is
a scope decision and not a consequence of what the build can do.

- **What you write:** one import line.
- **Where it lives:** your app's CSS.
- **What it costs:** nothing to author. You take our picks.
- **What it preserves:** everything, generated ahead of time from a seed we
  chose.
- **What it voids:** nothing. A preset sits in its own layer, so it always beats
  the defaults and your own overrides always beat it, whatever order anything is
  imported in.
- **Across 0.x:** not applicable while no preset ships.

### Rung 1a: re-point the tint

**"Warm our greys up."**

```css
@layer overrides {
  :root {
    --nave-color-tint: oklch(0.78 0.13 90);
  }
}
```

Changing this changes everything Nave derives from it. The contrast of the
resulting palette follows from what you set, and checking it is yours.

- **What you write:** one custom property.
- **Where it lives:** a CSS block in your app. No build.
- **What it costs:** one line, and it takes effect in the browser.
- **What it preserves:** everything. The neutral surface re-hues live, and so
  does the text set on the primary action and on danger
  (`--nave-color-on-action-primary` and `--nave-color-on-feedback-danger`),
  which is neutral too. The accent does not move: the primary action, links, the
  focus ring and the danger colours stay exactly as shipped.
  [TOKENS.md](packages/tokens/TOKENS.md) marks every colour that follows the
  tint.
- **What it voids:** nothing. The tint is an input the generator already reads.
- **Across 0.x:** fine. A change to the step table re-derives underneath you,
  which is what you want at this rung.

### Rung 1b: re-seed

**"Our brand colour is this."** This is the rung getting started shows, and the
one most teams want.

```json
{
  "scripts": {
    "tokens": "navecss-tokens build --seed=#2f6feb --out=src/styles/nave"
  }
}
```

Changing this changes everything Nave derives from it. The contrast of the
resulting palette follows from what you set, and checking it is yours.

Commit what the build writes into that directory, then point your app at it
instead of at ours:

```css
/* app.css */
@import url('@navecss/core/no-tokens');
@import url('./styles/nave/tokens.css');
```

`@navecss/core/no-tokens` is the same stylesheet as `@navecss/core` without its
token layer, so your file becomes the sole source of every Nave custom property:
the spacing, the radii, the type, the motion, not only the colours. Importing
both would leave two declarations of every name in one layer, and which one
renders would come down to the order your bundler happened to emit them in.

- **What you write:** a seed colour, in your `package.json` script.
- **Where it lives:** one build command; you commit the output.
- **What it costs:** a build step you run when the seed changes, and nothing at
  runtime.
- **What it preserves:** everything. The whole system is regenerated from your
  seed.
- **What it voids:** nothing. This is the generator doing its job on your input
  instead of ours.
- **Across 0.x:** fine. A step-table change re-derives underneath you, and a
  change to our own default seed does not reach you at all once you have
  re-seeded.

#### Seeding with no colour

Seed with a grey and you get a monochrome system, not an error. Nave reads the
chroma of your seed; at exactly zero there is no hue to build an accent from, so
the accent slots resolve onto the neutral ladder instead of a colour ramp.
`oklch(0.5 0 0)` says zero exactly, and so does a hex or `rgb()` grey
(`#808080`, `rgb(128 128 128)`): every achromatic sRGB input converts to
exactly zero chroma, never a residual that would tint the neutral ramp with an
arbitrary, imperceptible hue.

It is this rung's command, with a grey passed to it:
`navecss-tokens build --seed="oklch(0.5 0 0)" --out=src/styles/nave`

What you get: no accent hue anywhere in the interface. The primary button is a
near-black fill in the light scheme and a near-white one in dark. Links take the
body text colour instead of an accent colour, so colour is not what marks a link
here: leave whatever else marks it in place. The focus ring becomes a neutral one.

What does not change: `danger` keeps its own scale, so a destructive action still
reads as destructive. And your greys still follow the tint, so warming or cooling
them moves the whole surface, the button included.

You write none of these values. They are generated from your seed, which means a
later re-seed with a colour brings the accent back with no cleanup on your side.

### Rung 2: override a semantic slot

**"Our danger red is the corporate red."**

```css
@layer overrides {
  :root {
    --nave-color-feedback-danger: light-dark(oklch(0.47 0.15 15), oklch(0.84 0.07 15));
  }
}
```

Changing this changes everything Nave derives from it. The contrast of the
resulting palette follows from what you set, and checking it is yours.

- **What you write:** one declaration per slot, with both a light and a dark
  value. Every semantic slot carries both branches; setting one renders your
  light value against dark browser chrome for anyone in dark mode.
- **Where it lives:** a CSS block in your app. No build.
- **What it costs:** the slots you name stop being generated.
- **What it preserves:** generation, everywhere except the roles you pinned.
- **What it voids:** the link between that slot and the generator. It will not
  move when you re-seed or re-point the tint, which is why an override block is
  removed before you do either.
- **Across 0.x:** fine. A new semantic slot arrives with a default, so it does
  not break you.

#### Worked example: neutral actions

Say you want a monochrome interface but you are seeding with your brand colour,
because you want it on links, focus rings and charts. Override the slots that
draw from `primary` and leave the rest alone.

As of this writing that is the three `action.primary` states, and nothing else:

```css
@layer overrides {
  :root {
    --nave-color-action-primary: light-dark(oklch(0.27 0 0), oklch(0.905 0 0));
    --nave-color-action-primary-hover: light-dark(oklch(0.18 0 0), oklch(0.94 0 0));
    --nave-color-action-primary-active: light-dark(oklch(0.12 0 0), oklch(0.985 0 0));
  }
}
```

These values are ours, not yours: pasting them pins the three action slots to
fixed greys, so they stop following your seed and your tint. Anything else on
your page is still yours to check.

The rule is what matters more than the list: override every slot that draws from
`primary`, and check the list against your own generated palette rather than
against this block.

Both values per slot, always. Every semantic slot Nave emits carries a light and a
dark branch; a single value would render your light-scheme button against dark
chrome for anyone in dark mode.

The lightnesses are the step table's own, for steps 800, 900 and 950. They stay
off the 0 and 1000 anchors on purpose: a pure black pressed state reads as a hole
rather than as a shade darker. The chroma is zero, so these three are flat greys
that do not follow your tint, which is what the note above is about.

What this changes and what it does not: your surfaces still re-hue from your seed,
`danger` is untouched, and links and the focus ring keep their colour, which is
the point of doing it this way rather than seeding grey.

Remove this block before you re-seed or re-point the tint. It pins the action
slots, and neither will move them.

### Rung 3: override a step

**"Step 500 is muddy in our brand."**

```json
{
  "primary": { "500": 0.11 }
}
```

```json
{
  "scripts": {
    "tokens": "navecss-tokens build --seed=#2f6feb --overrides=nave.steps.json --out=src/styles/nave"
  }
}
```

Changing this changes everything Nave derives from it. The contrast of the
resulting palette follows from what you set, and checking it is yours.

- **What you write:** the chroma you want, for the steps you want to replace, per
  scale. Lightness per step is fixed and is not a tunable.
- **Where it lives:** a JSON file in your repo, named on the build command. This
  is a build-time act, not a CSS declaration, because steps are not emitted.
- **What it costs:** a build step, and one pinned value per step you name.
- **What it preserves:** generation, minus one rung of one ramp. Everything
  derived from the steps you did not touch still derives, and your overrides are
  applied to the generated ramp before the semantic slots resolve, so a slot
  pointing at a step you pinned gets your value.
- **What it voids:** the generator's control of the steps you pinned.
- **Across 0.x:** a step-table change re-derives underneath you and may fight
  your pins here, which is the cost of pinning. Pin an exact version if that
  matters to you.

### Rung 4: your build system drives the build

**"Our build system runs Nave's build."**

There is no Nave configuration file, at this rung or at any other. The entry
point reads nothing it was not handed: no file is discovered, no directory is
searched, and the inputs the rungs above pass on the command line are the whole
surface. What changes here is who supplies them. Instead of a seed you typed
into a script once, your own build passes them from wherever it already keeps
them, and Nave's build becomes one task inside yours.

Changing this changes everything Nave derives from it. The contrast of the
resulting palette follows from what you set, and checking it is yours.

- **What you write:** the invocation, inside your own build. Nave's inputs
  become inputs of your build system rather than literals in a script.
- **Where it lives:** your own build's configuration in your repo, the script or
  the task that invokes the entry point.
- **What it costs:** your build is wired to how the entry point is invoked, so
  the wiring is yours to keep working.
- **What it preserves:** everything Nave generates, the ramp included.
- **What it voids:** nothing about the output. What you give up is a stable input
  shape.
- **Across 0.x: the invocation surface is explicitly unstable, and the cost is
  unbounded in 0.x and bounded at 1.0.** The flag names and their spellings, the
  exit codes and what a run writes are what your build wires itself to, and they
  are what we reserve the right to move before 1.0. That makes this the most
  expensive rung on the ladder to change later, so we would rather say so than
  promise otherwise. Pin an exact version and read the release notes.

### Rung 5: bring your own token source

**"We have our own token source."**

```bash
navecss-tokens validate --source=src/styles/our-tokens.css
```

Changing this changes everything Nave derives from it. The contrast of the
resulting palette follows from what you set, and checking it is yours.

- **What you write:** your own token source, in DTCG 2025.10, or your own built
  CSS.
- **Where it lives:** your repo.
- **What it costs:** you satisfy the required core contract yourself. The
  contract ships as a machine-readable manifest, and `validate` reads it and
  names every token in it your source does not declare. It checks that list and
  nothing else, so a clean run means the names the contract carries are present,
  not that your palette is complete. And if your token file is written to the
  format's earlier pre-stable draft, which is what most token tooling still
  exports, converting it is a step you take before this rung is available at
  all: the reader reads one shape, and a refusal names every node to change and
  the edit each one needs, in a single run.
- **What it preserves:** the required core contract only.
- **What it voids:** Nave's generated palette, and every Nave name outside the
  required core contract. Any Nave token your own CSS references beyond that
  contract is yours to supply, and nothing will name it for you when it is
  missing.
- **Across 0.x: unbounded in 0.x, bounded at 1.0.** Pin an exact version and
  read the release notes.

All seven rungs are supported and documented as supported. Rung 4's invocation
surface is the one thing published as explicitly unstable, per its own row.

## Accessibility

WCAG conformance is defined for whole web pages, not for libraries. Nave ships
tokens and utility classes; you compose them into a page along with your own
markup, your own content and usually somebody else's components. So "NaveCSS is
WCAG 2.2 AA compliant" is not a statement that can be true or false about a
library, and this section does not make it.

What Nave can do instead is say what it guarantees about the artifacts it ships,
and say just as plainly where your own responsibility starts. The two lists
below carry equal weight.

### What Nave promises about what it ships

**A visible keyboard focus indicator by default, with no author action
required.** Nave's reset ships no rule that removes the browser's own focus
indicator at document scope, so every focusable element in a document using
the reset keeps one (supports SC 2.4.7 Focus Visible, Level AA). A regression
test asserts that no reset rule strips the indicator outside a
`:focus-visible` gate.

**Motion tokens honour `prefers-reduced-motion` in the shipped CSS** (supports
SC 2.3.3 Animation from Interactions, Level AAA; it does not on its own satisfy
it, because you can still write an animation that ignores the tokens). A test
asserts the collapse is present in the built output, and the token layer and the
reset agree on the same collapsed duration.

**Breakpoint conditions are emitted in `em`, so they respond to the reader's
browser font-size preference** (supports SC 1.4.4 Resize Text, Level AA; it does
not on its own satisfy it). The mechanism is worth stating precisely, because
the usual shorthand for it is wrong: an `em` in a media query resolves against
the browser's default font size, never against a font size the page itself
sets.

### What Nave does not promise

Read this list as carefully as the one above it. If you are running an
accessibility audit, this is the part you can act on.

1. **Page-level WCAG conformance of anything you build.** Conformance is a
   property of a page. Nave supplies parts.
2. **The contrast of any palette you supply.** The moment you re-seed through
   the [customization ladder](#theming), the contrast of the resulting palette
   is a property of your seed, and checking it is yours.
3. **The contrast of arbitrary step pairs in a generated ramp.** Nave states no
   rule of the form "any step N against any step N plus M clears a given ratio".
4. **Keyboard, focus-order and ARIA behaviour of bridged upstream components.**
   Their behaviour is theirs. Nave promises its values, not their semantics.
5. **Anything about the component registry**, until components exist and have
   been reviewed one by one.
6. **That applying atoms produces an accessible interface.** Atoms are visual
   utilities and carry no semantics of their own. A clipped, ellipsised
   `truncate` in particular leaves the full text in the accessibility tree, so
   what is seen and what is announced come apart.
7. **Motion you write with raw values.**
8. **That a feedback token tells warning from success from info.** Those three
   roles resolve to one shared value, and so do their `-foreground` roles; only
   `danger` is a separate family. What separates those three states on a page is
   whatever else you render, not the token.

## Stability and maintenance

Nave is at 0.x. Before 1.0, a breaking change ships in a minor release (0.1 to
0.2) and its release notes say what breaks; a patch release carries fixes. Pin
an exact version if you need nothing to move, and read the release notes before
you upgrade. `@navecss/core` and `@navecss/tokens` are released together, always
at the same version number, so upgrade them together.

The `@layer` order is the contract your own CSS is written against: seven layer
names in a fixed order
([ADR 0003](docs/04-adr/0003-layer-cascade-contract.md)). Renaming, reordering,
removing or inserting a layer counts as a breaking change, even where it looks
cosmetic. How each way of customizing fares across 0.x is stated rung by rung
under [Theming](#theming).

Both packages are ES modules only, with no CommonJS build, and need Node 22.18 or
later. What each one needs from your toolchain and your browsers is in its own
README: [`@navecss/core`](packages/core/README.md#requirements) and
[`@navecss/tokens`](packages/tokens/README.md#requirements).

Nave has one maintainer, who decides what goes in. Issues and pull requests are
read and answered as time allows. Security reports have their own route:
[SECURITY.md](.github/SECURITY.md).

## License

MIT © Nave Contributors

## Brand and name

The MIT licence covers the code. The "Nave" and "NaveCSS" names and the Nave mark are trademarks of
the project and are not covered by it: see [TRADEMARKS.md](./TRADEMARKS.md). Short version: yes, say
you are built with NaveCSS and show the mark unmodified; no, do not make it your own logo.
