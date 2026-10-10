# @navecss/core

> Layer architecture, reset, atomic utilities, the Vite and PostCSS plugins, a Lightning CSS adapter and the `navecss-core` command for Nave.

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
  [Vite plugin setup](#vite-plugin-setup) has the line for Vite.
  [Why this floor](https://github.com/navecss/navecss/blob/main/docs/04-adr/0005-browser-floor.md).
- **A resolver that reads `exports` maps.** Every entry point, the stylesheet
  included, is reachable only through the package's `exports` map: there is no
  `main` field to fall back on.
- **ES modules.** `@navecss/core/cx`, `@navecss/core/atoms`,
  `@navecss/core/vite`, `@navecss/core/lightningcss` and `@navecss/core/check` load through `import` only. A `require()` of any of
  them fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`, which reads as though the
  entry point did not exist. In TypeScript, set `moduleResolution` to `bundler`,
  `node16` or `nodenext`; under `node10` their types are not found. A CommonJS
  file type-checks against them and then fails when it runs, so import them from
  an ES module. `@navecss/core/postcss` also loads through `require()` (Node
  loads the ES module for you, which the Node version below includes), so a
  CommonJS `postcss.config.js` can use it.
  For TypeScript to check a `require()` of it, use `module` `nodenext`
  (TypeScript 5.8 or later) or `node20` (5.9 or later) with `moduleResolution`
  unset or `nodenext`, or `module` `preserve` with `moduleResolution` `bundler`,
  or turn on `skipLibCheck`. Under `module` `node16`, or `nodenext` before 5.8,
  TypeScript describes a Node that cannot `require()` an ES module and reports
  an error in the package's types.
- **Node 22.18 or later.**
- **A build step that resolves `@nave`: the Vite plugin, PostCSS 8, the Lightning
  CSS adapter or the command.** On
  Vite, `@navecss/core/vite` needs nothing installed beside Vite, and
  [Vite plugin setup](#vite-plugin-setup) is its whole setup. On any other
  pipeline that runs PostCSS plugins, use the PostCSS plugin: `postcss` is an
  optional peer dependency, so nothing installs it for you. Add it yourself if
  you use that route; without it, importing `@navecss/core/postcss` fails with
  `Cannot find package 'postcss'`. [PostCSS plugin setup](#postcss-plugin-setup)
  has it. A host that runs Lightning CSS itself uses
  [the Lightning CSS adapter](#lightning-css-adapter-setup), which needs nothing
  installed beside Lightning CSS, and a project with no bundler uses
  [`navecss-core expand`](#navecss-core-expand). The stylesheets and `cx()` need
  none of them.

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
any layer, your CSS would beat all of them, `overrides` included.
That is the order for normal declarations. `!important` reverses it: an `!important` in
`overrides` loses to one in any earlier layer, Nave's reset included, and one outside any
layer loses to every layered one. Do not write
into a bare `@layer components` or `@layer tokens`: a rule written directly into a
layer outranks everything in that layer's sublayers.

---

## Styling components

Nave gives you three ways to apply atomic utilities. Start with @nave directives.
Every built-in atom, with the declarations it applies, is listed in
[ATOMS.md](./ATOMS.md).

### Primary — @nave directives

Requires the Vite plugin or the PostCSS plugin. Everything stays in CSS files.

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

No build plugin required. Atom names move to JSX — autocompleted, and type-checked.

```tsx
import { cx } from '@navecss/core/cx'
import styles from './button.module.css'

;<button className={`${cx('interactive', 'focusRing', 'transition')} ${styles.root}`} />
```

Use this if you cannot or do not want to add a Vite or PostCSS plugin to your build.
With the Vite plugin, the build reads every `cx()` call to choose which atoms ship, and fails on one
whose atoms it cannot read, so a name chosen at run time goes through `cx.dynamic()`: see
[Which atoms the build ships](#which-atoms-the-build-ships).

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
  depend on types, use the Vite plugin, which by default fails the build on an
  unknown atom in a `cx()` call, or the `@nave` directive, whose build steps all
  fail on an unknown atom by default.
- **`cx.raw()` cannot shadow one of your classes.** It never consults the atom
  map, so `cx.raw('container')` is the literal `container`. Inside `cx()` an
  atom name still resolves to that atom's global class — `cx('container')` is
  `nave-container` — which is why the ordinary-sounding names (`container`,
  `hidden`, `grid`, `flex`, `block`, `border`, `rounded`, `transition`,
  `relative`, `absolute`, `gap`, `truncate`, `interactive`) belong on the
  `cx.raw()` side when you mean your own.
- **The rest of the `className` attribute is checked by
  [`@navecss/eslint-plugin`](https://github.com/navecss/navecss/tree/main/packages/eslint-plugin#readme).**
  A bare `'legacy-card'` sitting beside these calls is not seen by `tsc` or by
  `@nave`, so `cx.raw()` is a **declared** escape channel — install that plugin
  for an **enforced** one: it reports an undeclared literal class written in
  `className`, and requires a reason on a `cx.raw()` call that carries one, so
  a deliberate step outside the system stays a reasoned, countable call.

### Tokens only

For library authors or teams building on top of Radix UI or another headless library. On Base UI, [`@navecss/base-ui`](https://github.com/navecss/navecss/tree/main/packages/base-ui#readme) styles its components with these same tokens.
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

## Setting up `@nave`

On Vite, use the Vite plugin: it is the one route this package teaches for Vite. On
Next.js, webpack, or any other pipeline that runs PostCSS plugins, use the PostCSS plugin. A host
that runs Lightning CSS directly uses [the Lightning CSS adapter](#lightning-css-adapter-setup),
and a project with no bundler uses [`navecss-core expand`](#navecss-core-expand).

### Vite plugin setup

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { navePlugin } from '@navecss/core/vite'

export default defineConfig({
  // your existing options stay as they are; add navePlugin() to your existing plugins
  plugins: [navePlugin()],
  build: { cssTarget: ['chrome125', 'edge125', 'firefox128', 'safari18', 'ios18'] },
})
```

`navePlugin()` takes the same `extend` and `onUnknown` options as the PostCSS plugin
([Options](#options)) and returns two Vite plugins in an array, which `plugins` takes as one entry.
It has no dependency and no peer. It expands `@nave` after Vite's own CSS step has run, so a stylesheet reached only
through `@import`, a Sass file (including a `@mixin` that holds a directive), a CSS Module, an
`?inline` or `?url` import, a Vue or Svelte style block and a `.css` inside `node_modules` are all
read as the CSS they compile to, in `vite build` and in the dev server, under either
`css.transformer`. A `?raw` import returns the file's text as it is. Astro is not covered: it was
not measured at this release, and no fixture of it runs.

**It also chooses which atoms ship.** A `cx()` call in your code whose atoms the build cannot read,
such as `cx(variant)` with a prop, is an error in the dev server and fails `vite build`.
By default only the atoms Nave can read a use for are served, in the dev server as in the build. A `nave-*` class neither can see, such as one in a server template or in CMS text, or one a package listed in `keepFor` applies at run time, has no rule unless its atom is listed in `keep` or in a `keepFor` entry. Run your checks, keyboard, screen-reader and automated accessibility checks included, against a production build as well as in dev, because the two can still differ; [Which atoms the build ships](#which-atoms-the-build-ships) says what the build reads and where dev differs.

`build.cssTarget` is the browser floor, in Vite's terms. Vite's default targets
older browsers, and building for them gains you nothing, because the output
still needs the floor. It does cost you something: Vite rewrites `light-dark()`
in Nave's colours into an emulation that a `color-scheme` set from script, or on
part of the page, does not switch. The plugin sets no floor of its own, because the floor is a
requirement of Nave's stylesheets, not of the directive: a project that never writes `@nave`
needs the same key.

**Migrating from the PostCSS plugin.** Move `navePlugin()` from `css.postcss` or
`postcss.config.js` to `plugins`, importing it from `@navecss/core/vite`. Leaving both is
harmless, because whichever pass runs second finds no directive left. Moving also changes which
atoms ship: the PostCSS plugin ships every atom, and this one chooses them from the uses it can
read, in the dev server too, so after the move a `cx()` call it cannot read fails the build, and a
Nave class it cannot see has no rule unless its atom is listed in `keep`.

**Under `css.transformer: 'lightningcss'`** the plugin expands exactly as it does under the default
transformer once both floor keys below are set. At Vite's default targets, which sit below the
floor, Lightning CSS lowers CSS nesting before any plugin runs, and two things change.
A directive written after a declaration that follows a nested rule can be moved ahead of that
declaration: in `.a { &:hover { color: red; } display: grid; @nave block; }`, `grid` wins with no
message, where the default transformer makes `block` win. A directive in a group rule nested in a
style rule (`.a { @media (...) { @nave flex; } }`) still fails the build, but the message no longer
names the `& { @nave ...; }` workaround, and its position is in the CSS as Lightning CSS rewrote
it, not in your file. The plugin also drops one message and only that one: Lightning CSS's
`Unknown at rule: @nave` warning, which Vite prints for every directive before any plugin runs.
It does so by wrapping the logger Vite resolved. Stated cost: that is a logger Vite owns, which is
your own object when you pass a `customLogger`. The filter matches case-insensitively, and an
escaped spelling (`@n\61ve`) may still warn. It fails open: if Vite changes its prefix or its
logging path the warnings come back and nothing is lost, and the end-of-build scan below catches
any directive that did survive. A warning about any other unknown at-rule is still printed. Set both
floor keys:

```ts
// vite.config.ts, with css.transformer: 'lightningcss'
import { defineConfig } from 'vite'
import { navePlugin } from '@navecss/core/vite'

export default defineConfig({
  plugins: [navePlugin()],
  build: { cssTarget: ['chrome125', 'edge125', 'firefox128', 'safari18', 'ios18'] },
  css: {
    transformer: 'lightningcss',
    lightningcss: {
      targets: {
        chrome: 125 << 16,
        edge: 125 << 16,
        firefox: 128 << 16,
        safari: 18 << 16,
        ios_saf: 18 << 16,
      },
    },
  },
})
```

`build.cssTarget` alone still rewrites `light-dark()` under that transformer, so the two keys go
together.

**The end of every build is checked.** The plugin reads the CSS files the build wrote and fails the
build if a `@nave` directive is left in one, with the same lines
[`navecss-core check`](#navecss-core-check) prints, under the plugin name `nave`. There is no
option to turn it off: a directive in shipped CSS is never wanted, and `onUnknown: 'ignore'`
does not change it. Four places are not covered. The dev server serves no bundle, so there is no
scan in dev. CSS that ends inside a JavaScript string (`?inline`) is not a CSS file the build wrote,
so it is not scanned. Files under Vite's `public/` directory are copied as they are and are not
scanned. A CSS file another plugin adds after the scan has run is not scanned either: the scan runs
in a post-ordered `generateBundle`, so it misses a file emitted from a post-ordered
`generateBundle` in a plugin listed after `navePlugin()`, and anything a plugin writes in
`writeBundle`. List `navePlugin()` after plugins that emit CSS files; a file written in
`writeBundle` stays outside the scan wherever the plugin is listed.

**A change to your atoms re-runs the stylesheets that use them.** Pass `extend` as a path to a
module (resolved from Vite's project root, whose default export is the atoms object), and the
plugin declares the file to Vite: edit it, and the dev server serves the new value with no restart,
and `vite build --watch` rebuilds. An object written inline in your config is not a file Vite can
watch.

The supported Vite range is measured, not declared: the fixtures run on Vite 8.2.1 and on the
newest 8.x at the time of each release.

#### Which atoms the build ships

The Vite plugin also chooses which of Nave's atoms reach your stylesheet. It reads the `cx()` calls
in the code the build compiles, dependencies included, and ships the rules for the atoms those calls
name, for the atom of each Nave class written as text (`nave-grid` in `index.html` or in a string in
your code, say), and for the atoms you list in `keep` and `keepFor`; `srOnlyFocusable` also ships
whenever `srOnly` does. The dev server serves the same atoms, from the code it has read. This is
what `navePlugin()` does with no options. On the CSS-first path, where `@nave` copies an atom's
declarations into your own rule, a project that never calls `cx()` and writes no Nave class ships no
rule from the atom layer.

So that nothing is dropped on a guess, a `cx()` call whose atoms the build cannot read fails the
build. `vite build` reads every module first and fails once, at the end, with a report that lists
each such use with its file, and its line and column when the source maps lead back to them, then
says how to fix them:

```text
2 problems in 2 files: the build cannot tell which atoms these apply, and it ships only the atoms it can read.
src/Card.tsx:7:26: cx(variant): the argument is not a literal atom name.
src/List.tsx:12:26: cx is passed to map() as a value instead of being called.
Name the atoms at the call: a string literal, a const in the same file, or a condition choosing between them, as in cx(on ? 'flex' : 'grid').
To choose by a value, call cx() once per case and pick between the results: ({ row: cx('flex'), grid: cx('grid') })[variant].
If the name comes from data the build never sees, write cx.dynamic(name) and list every atom it can take in keep in navePlugin().
Call cx() where the classes are applied, with the atom names as its arguments: the build reads calls, not a cx that is assigned, passed or spread.
```

The dev server reports the problems in your own code one module at a time. It reads your
dependencies' `cx()` calls as well, so their atoms are served in dev as in the build, but their
problems show in `vite build` only: in dev, Vite pre-bundles dependencies into files that can mix
several packages, so a problem there cannot be traced to one package. To read those calls, the
plugin keeps `@navecss/core` itself out of Vite's dependency pre-bundling (`optimizeDeps.exclude`),
so in dev the browser loads it as a few separate modules.

A stylesheet you import with `?inline` or `?raw` becomes text in your JavaScript, which the plugin
does not filter: if it holds Nave's atom layer, every atom in that layer ships, and `vite build`
warns, naming the file. Import it without the query to have the layer filtered.

**What the build can read.** An argument whose possible values the build can list: a string
literal; `null`, `undefined`, `false` or `''`; a condition choosing between those
(`on && 'flex'`, `on ? 'flex' : 'grid'`, `a || b`, `a ?? b`); or a variable in the same file
bound to one of them and never assigned again, such as a `const`. A prop, a parameter, a variable
that is assigned again, an import from another file, an array element, an object property and a
spread are not, and `cx` itself must be called, never passed on (`list.map(cx)` fails). Types do
not count: a value typed `AtomName` is still a value the build cannot list, and a cast is gone
before the build reads the call. A string holding two names (`cx('flex gap')`) fails too: pass
each name as its own argument.

To choose by a value, such as a `variant` prop, call `cx()` once per case and pick between the
results:

```tsx
import { cx } from '@navecss/core/cx'

const layouts = { row: cx('flex'), grid: cx('grid') }

export function List({ variant }: { variant: keyof typeof layouts }) {
  return <ul className={layouts[variant]} />
}
```

**Names chosen at run time.** When a name is known only at run time, because it comes from data,
pass it to `cx.dynamic()` and list every atom it can take in `keep`:

```tsx
// vite.config.ts
import { defineConfig } from 'vite'
import { navePlugin } from '@navecss/core/vite'

export default defineConfig({
  plugins: [navePlugin({ keep: ['flex', 'grid'] })],
})

// Block.tsx, whose layout comes from your CMS
import { cx, type AtomName } from '@navecss/core/cx'

export const Block = ({ layout }: { layout: AtomName }) => <div className={cx.dynamic(layout)} />
```

`cx.dynamic()` takes one name. A name listed in `keep` (or in a `keepFor` list) gets its atom's
class, in dev and in the build; any other value gets none (`''`), and in dev the console names the
value and says why. Every atom in `keep` ships, used or not. A `cx.dynamic()` call in your code with
`keep` empty is an error, in the dev server as in `vite build`, since every such call would apply
nothing. The plugin hands `cx.dynamic()` the atoms of `keep` and `keepFor` as static data, and
adds `@navecss/core` to every server environment's `resolve.noExternal`, so `cx.dynamic()` in a
server build reads them too.

**Code you import.** A module that re-exports `cx`, such as a design system's `index.ts` holding
`export { cx } from '@navecss/core/cx'`, is a build error until you list it in `cxModules`. The
build then reads a file that imports `cx` from it as if that file imported `cx` from
`@navecss/core/cx`. It follows a listed module one step: the listed module must re-export Nave's
`cx` from `@navecss/core/cx` itself, under the name `cx`. Write an entry as a path from Vite's
`root`, an alias your config defines, or a package name, which is how you list a published package
that re-exports `cx`. An import of a listed module through a spelling the build does not recognise
fails `vite build`, which names the file and says what to write instead.

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { navePlugin } from '@navecss/core/vite'

export default defineConfig({
  plugins: [navePlugin({ cxModules: ['./src/ui/index.ts'] })],
})
```

`@navecss/eslint-plugin` has a `cxModules` setting with the same name and the same entries, so one
list can serve both, with two differences. The lint reads a relative entry from the directory it
runs in, and the build from Vite's `root`: where those differ, as in a monorepo, write the entries
as aliases or package names. And the lint resolves an import as Node's `require()` does, where the
build uses Vite's resolver: the build recognises spellings the lint cannot resolve, such as an alias
set only in your Vite config, and where the lint cannot resolve a `#` import it matches a `#` entry
written the same way, which the build never does.

A dependency whose `cx()` calls the build cannot read fails the build with the package named,
because its code is not yours to change. List the package in `keepFor`, under its name, with the
atoms its calls can produce, which its documentation should give you:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { navePlugin } from '@navecss/core/vite'

export default defineConfig({
  plugins: [navePlugin({ keepFor: { '@acme/ui': ['flex', 'inlineFlex', 'itemsCenter'] } })],
})
```

Those atoms ship as if they were in `keep`, beside the atoms of the package's calls the build does
read. The calls it cannot read are not changed: one that produces any other atom still puts that
atom's class on the element, and the class has no rule, in dev as in the build, unless the atom
ships for another reason. An empty list, `keepFor: { '@acme/ui': [] }`, says that the calls the
build cannot read produce no atom. A `cx.dynamic()` call in the package needs its atoms in the
list: with an empty list, or none, it fails the build. Each client build records, in the
`nave-used-atoms.json` file described below, the atoms it read from each listed package's calls,
where the calls it could not read are, and any `keepFor` key that names no package the build read.

`keepFor` stands in for the package's own calls, never for a call your code makes, so three
problems in a listed package still fail the build. A module of the package that re-exports `cx`
under the name `cx` still fails when your code, or another dependency, imports `cx` from it, and the
report gives the `cxModules` entry that lets the build read those calls. A module that gives `cx`
out under another name, as a default or inside a namespace, still fails when your code takes that
export, and the report names each file of yours that does: import `cx` from `@navecss/core/cx`
there instead. And a module of the package that you list in `cxModules` but that does not re-export
Nave's `cx` under that name still fails: remove it from `cxModules`.

A package inside your own workspace is your code, not a dependency: Vite resolves it by its real
path, outside `node_modules`, so its calls are reported as yours, in the dev server too, and
`keepFor` does not cover it.

**What the build cannot see.**

A class the build does not read (in a server template or CMS text, assembled where the build cannot see it, or applied at run time by a package listed in `keepFor`) has no rule in the production stylesheet unless its atom is listed in `keep` or in a `keepFor` entry (`nave-sr-only-focusable` also has its rule whenever `nave-sr-only` has one). An element carrying such a class renders as if the class were absent: a `nave-sr-only` or `nave-sr-only-focusable` element is shown, a `nave-hidden` or `nave-hide-*` element is displayed, and a `nave-focus-ring` element falls back to the browser's default focus indicator. A `nave-hidden` or `nave-hide-*` element that other styles also keep out of sight (moved off-screen, made transparent or clipped) stays out of sight but can take keyboard focus and is exposed to screen readers. The dev server serves the atoms the build would ship, chosen from the code it has read, so a class the build does not read has no rule in dev either. The dev server can still keep a rule the build drops, for code it read and the build does not (such as a module that only a server render inside the dev server loaded, or one the page stopped importing while the dev server ran), and lack one the build keeps, for a class rendered only on a server that runs outside the dev server's process, so a page can still look and behave differently in dev than in the build. Before you ship, run your checks, keyboard, screen-reader and automated accessibility checks included, against the production build: `vite build` then `vite preview` for a client-rendered app, or your production server for a server-rendered one.

A class your code takes at run time from `@navecss/core/atoms` (`atomClassMap[variant]`,
`toClassName('grid')`) is one the build does not read: it neither reads nor refuses it, so list its
atom in `keep`.

If your pages are rendered outside the build, by a backend that serves its own templates and uses
Vite for its assets only, the build reads none of their classes. While `keep` is empty, the plugin
warns when it has read no HTML page, no server render and no use of Nave at all: no `cx()` call, no
Nave class and no `@nave` directive. A backend whose scripts call `cx()`, or whose CSS uses `@nave`,
gets no warning, and the classes in its templates have no rule all the same. List the atoms your
templates use in `keep`, or, if they are many, ship every atom (below).

The PostCSS plugin and the Lightning CSS adapter read no `cx()` call and leave every atom in the
layer, on Next.js and webpack alike; so does a page with no bundler, which links the standalone
stylesheet.

A server build leaves packages in `node_modules` external by default, so it does not read their
code. For such a package that depends on `@navecss/core`, the build warns, naming it, unless it is
listed in `keepFor`. On the server, its `cx.dynamic()` calls also map through every atom rather than
through `keep`, so the class such a call renders can be an atom outside the set the build ships,
its emitted set. Where the build ships no rule for that atom, the element renders as if the class
were absent;
where another use put that atom in the emitted set, the server-rendered element carries the atom's styling, and can keep it after the page hydrates: React, for one, does not guarantee to correct an attribute that differs between the server's markup and the client's render.
Add such a package to `ssr.noExternal` in your Vite config: the build then reads it, and its
`cx.dynamic()` calls on the server read `keep` too. Listing it in `keepFor` instead stops the
warning and ships its listed atoms, but its `cx.dynamic()` calls on the server still map through
every atom.

If you build the client and the server in two commands, build the server first: `vite build --ssr`,
then `vite build`. The two share a file in Vite's cache directory, so the client build also ships
the atoms the server build read. Built the other way round, a server atom the client's CSS lacks
fails the server build, which records the atom for the next client build, and the report says how
to clear it. A server build that finds the client's list already used cannot check the CSS, so it
warns instead, naming each atom the last client build did not ship, and records them the same way.

That file is `nave-used-atoms.json` in Vite's cache directory (`node_modules/.vite/` unless you set
`cacheDir`). Each `vite build` writes its atoms there, sorted, as the `emitted` list; after a client
build, that list is the set of atoms its CSS holds, so you can diff it between builds.

**Shipping every atom.** `navePlugin({ atomic: 'all' })` reads no `cx()` call and ships every atom,
as the PostCSS plugin does. It suits a project whose Nave classes are mostly written where no build
reads them, such as a backend's own templates or HTML from a CMS, where listing them in `keep` is
not practical. It gives up what this section describes: no `cx()` call is read or checked, a name
that is no atom passes through `cx()` as text, as it does without the plugin, and `cx.dynamic()`
maps through every atom. The dev server serves every atom too, the plugin sets neither
`optimizeDeps.exclude` nor `resolve.noExternal`, no build writes `nave-used-atoms.json`, and
`keep`, `keepFor` and `cxModules` are still checked for well-formed values and otherwise do nothing.
It is also the way out that the plugin's own check names when a build's atom layer does not hold
exactly the atoms the build chose: removing the others relies on a part of Vite's CSS step that is
not a public Vite API, measured on Vite 8.2.1 and the newest 8.x at the time of each release, and on
a Vite where it does not take, every build fails that check until the plugin supports that version.

**If you publish components that call `cx()`.** Your users' builds read your published code. Write
every name your components choose at run time through `cx.dynamic()`, and every other call so the
build can read it. Then export the atoms those calls can take, so a user lists them in one line that
moves with your version:

```ts
// in your package, published as @acme/ui/nave-atoms
import type { AtomName } from '@navecss/core/cx'

export const naveAtoms = ['flex', 'grid', 'itemsCenter'] as const satisfies readonly AtomName[]

// in your user's vite.config.ts
// import { naveAtoms } from '@acme/ui/nave-atoms'
// navePlugin({ keepFor: { '@acme/ui': naveAtoms } })
```

A user whose app sits in the same repository as your package, as a workspace package, passes the
list to `keep` instead (`navePlugin({ keep: naveAtoms })`): the build reads a workspace package as
their own code, and `keepFor` does not reach it.

List every atom your components can apply at run time, `focusRing`, `srOnly`, `srOnlyFocusable`, `hidden` and the `hide*` atoms included where you use them: a consumer passes them to `keepFor` under your package's name, and one left out renders as if the class were absent in their production build.

### PostCSS plugin setup

For Next.js, webpack under `postcss-loader`, and any other pipeline that runs PostCSS plugins.

Add it to your PostCSS config:

```js
// postcss.config.js
import { navePlugin } from '@navecss/core/postcss'

export default {
  plugins: [navePlugin()],
}
```

A CommonJS config works too. Name it `postcss.config.cjs`, or keep `.js` in a project
without `"type": "module"`:

```js
// postcss.config.cjs
module.exports = {
  plugins: [require('@navecss/core/postcss')()],
}
```

`postcss` is an optional peer dependency.
If you are using only `cx()` or tokens, you do not need to install it.

#### Next.js

Next.js reads a PostCSS plugin by its package name, so give it the name as a key and do not
call `navePlugin()`:

```js
// postcss.config.mjs
export default {
  plugins: { '@navecss/core/postcss': {} },
}
```

The `navePlugin()` form above fails on Next.js's webpack pipeline with
`An unknown PostCSS plugin was provided`: that is Next 15's default and `next build --webpack`
on Next 16. Next 16's default, Turbopack, accepts either form.

Next.js also needs your browser floor, in `package.json`:

```json
{
  "browserslist": ["chrome 125", "edge 125", "firefox 128", "safari 18", "ios_saf 18"]
}
```

Without it, Turbopack compiles for older browsers and rewrites every `light-dark()` in your CSS,
Nave's colours included, into `--lightningcss-light` and `--lightningcss-dark` variables. Spell
the floor out as above: Next 15 rejects the shorter `baseline 2024` with `Unknown browser baseline`.

**If your Vite config sets `css.transformer: 'lightningcss'`, this plugin never
runs.** That option replaces Vite's CSS pipeline with Lightning CSS, which does
not run PostCSS plugins at all: the build stays green, `@nave` reaches the
browser as an unknown at-rule, and the browser drops it, so the rule renders
with none of the declarations its atoms were going to give it. On Vite, use
[the Vite plugin](#vite-plugin-setup), which runs under that option; to stay on this plugin,
leave the default transformer in place. A host that runs Lightning CSS directly, not through
Vite, uses [the Lightning CSS adapter](#lightning-css-adapter-setup). Add
[`navecss-core check`](#navecss-core-check) to your build script as well, and a
build that skips the plugin this way fails instead of shipping.

#### Plugin order

Put `navePlugin()` before any autoprefixing or syntax-down-levelling plugin (`autoprefixer`,
`postcss-preset-env`, and the like) in your `plugins` array. `navePlugin()` resolves `@nave`
directives into literal declarations; a prefixer ordered before it only ever sees the
unexpanded directive, so it has nothing of Nave's to add a prefix to. Nave's own atoms already
ship the vendor-prefixed properties their declarations need (`interactive`'s
`-webkit-user-select` alongside `user-select`, for one), so this is only a concern for your own
CSS sharing the same pipeline.

### Lightning CSS adapter setup

For a host that runs Lightning CSS directly: your own script, or a tool that calls its
`transform()` or `bundleAsync()`. It is not the route for Vite: on Vite, use
[the Vite plugin](#vite-plugin-setup), which also runs under `css.transformer: 'lightningcss'`.

```js
import { readFile } from 'node:fs/promises'
import { bundleAsync, transform } from 'lightningcss'
import { navePlugin } from '@navecss/core/lightningcss'

const nave = navePlugin()

// One file, through transform(): expand it first, then pass the code and the map on.
const { code, map } = nave.expand(await readFile('src/app.css'), 'src/app.css')
const result = transform({ filename: 'src/app.css', code, inputSourceMap: map, sourceMap: true })

// An entry file and everything it @imports, through bundleAsync().
const bundled = await bundleAsync({ filename: 'src/app.css', resolver: nave.resolver })
```

The adapter expands the text before Lightning CSS reads it, so Lightning CSS never sees a
directive: no `Unknown at rule` warning, no Lightning CSS parse error on a malformed directive, and
Nave's own messages, with the file's path and the line and column of each problem.
`expand(code, filename)` takes the text or its bytes and returns `{ code, map }`, the code as bytes
and the map as a string, ready for `transform()`'s `code` and `inputSourceMap`. `resolver.read` reads each file
`bundleAsync()` asks for and returns its expanded text, so a file reached through `@import` is
covered too. It takes `extend` (an object of your own atoms) and `onUnknown` as the other plugins
do ([Options](#options)); under `'warn'` it prints each problem with `console.warn`.

The adapter imports nothing from `lightningcss`, types included, and declares no peer: you bring
your own copy. The supported range is documented, not declared: `lightningcss` 1.24.1 and later.
Earlier releases can drop the message of an error a resolver throws during `bundleAsync()`, so a
malformed directive can fail a build with an empty error instead of Nave's message. The nested rules
the adapter writes also need CSS nesting, on by default only from 1.22 (1.20 and 1.21 cannot parse
them). The fixtures run on 1.24.1 and on the newest release at the time of each release of this
package. One cost, on the `bundleAsync()` path: `read` returns a string and no source
map, so Nave's insertions are not in the output map there. The inserted text adds no line breaks,
so line numbers hold. On the `transform()` path the map is chained through `inputSourceMap`.

### Options

```ts
navePlugin({
  // 'error' (default) — throw, failing the build
  // 'warn'            — log and skip
  // 'ignore'          — silently skip
  onUnknown: 'error',
})
```

Under `'error'`, every problem this option covers in one stylesheet is reported
in one error, positioned at the first: its message, then
`N more in this stylesheet:` and one `line:column:` line for each of the
others. The report covers one stylesheet, so a bundler that stops at the first
failing file reports one file per build. Under `'warn'`, each problem is a
warning of its own.

To add atoms of your own to `@nave`, pass them as `extend`: see
[CONSUMER-ATOMS.md](./CONSUMER-ATOMS.md). An `extend` object written inline in
a cached host's config, or imported into it, does not invalidate that host's
cache; pass `extend` as a path to the module instead when that matters. Only
the named file is re-read and declared to the host as a dependency; a module
it imports is neither (same doc).

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

## `navecss-core check`

A survival check: it reads built CSS and reports every `@nave` directive that
reached it, so a missing PostCSS pipeline or a bypassed one (Vite's
`css.transformer: 'lightningcss'`, for one) fails the build instead of
shipping a page with none of the declarations its atoms were going to give
it.

```json
{
  "scripts": {
    "build": "vite build && navecss-core check --source=dist"
  }
}
```

For Next.js, point it at the build's static output:

```json
{
  "scripts": {
    "build": "next build && navecss-core check --source=.next/static"
  }
}
```

`--source=` is repeatable, and each value is a file or a directory read
recursively for `.css`. Exit codes:

- `0` — at least one stylesheet was read, and none held `@nave`.
- `1` — at least one stylesheet held `@nave`; the findings are printed, one
  line each (file, line, column, the directive as written, and its enclosing
  selector when known).
- `2` — a usage error, an unreadable `--source` path, or no stylesheet found
  at all. An unreadable path gives `2` even when a stylesheet that was read
  held `@nave`; those findings are still printed.

Run it from a `package.json` script, chained with `&&` after the build that
should have resolved every directive, so it reads that build's output. The
command comes with `@navecss/core`; it is not a package of its own.

---

## `navecss-core expand`

For a project with no bundler. It reads each stylesheet, expands every `@nave`, and writes the
result:

```json
{
  "scripts": {
    "build": "navecss-core expand --source=src/app.css --out=app.css",
    "watch": "navecss-core expand --source=src/app.css --out=app.css --watch"
  }
}
```

`--source=` and `--out=` are repeated as pairs, matched by order, one pair per file; unequal
counts are a usage error. `--extend=<module>` is the path to a module whose default export is
your own atoms, read the way the PostCSS plugin reads one. `--watch` rewrites each `--out` when
its source, or the `--extend` module, changes, and keeps running after a problem. Every problem
across every file is printed in one run, one report per stylesheet. Exit codes:

- `0` — every file was expanded and written.
- `1` — at least one stylesheet held a problem; the problems are printed and `--out` is not
  written, for any of the pairs.
- `2` — the run could not be done as asked: a usage error (such as a missing or unmatched `--out`,
  an unknown flag, or an `--out` that is also a `--source`), an `--extend` module that could not be
  used, a `--source` that could not be read, an `--out` that could not be written, or, under
  `--watch`, a directory that could not be watched. Nothing is written, except that files written
  before an `--out` that failed stay written.

It does not resolve or inline `@import`; that would make it a CSS bundler. It
expands only the files you name with `--source`, so a stylesheet you import that
holds `@nave` needs a pair of its own. An `@import` of a relative or absolute URL
is kept as written and the file it names is not read, so its path has to work
from where the output is served, not from the source's directory. A bare import,
such as one of a package (`@import url('@navecss/core')`, which is how the
bundler route's `app.css` starts), is reported as a `bare-import` problem,
because a browser cannot load it. For Nave's stylesheets, link
`@navecss/core/standalone` instead, which has no `@import` in it, by path
(`node_modules/@navecss/core/dist/standalone.css`) or from a CDN
(`https://cdn.jsdelivr.net/npm/@navecss/core@<version>/dist/standalone.css`, with
`<version>` the version you installed), before your expanded stylesheet. For
`@navecss/core/no-tokens`, link that entry's own file, `dist/no-tokens.css`, the
same way: the standalone stylesheet holds Nave's token layer, which that entry
leaves out. [Without a bundler](https://github.com/navecss/navecss#without-a-bundler)
has the whole setup.

---

## Editor, linter and coding agent

`@nave` is new to these tools, so each one needs a step, and this package ships what each of
them reads.

**VS Code.** This package ships a data file that declares `@nave` to the CSS language service:

```json
{ "css.customData": ["./node_modules/@navecss/core/nave.css-data.json"] }
```

In a monorepo, the path is relative to the folder you open, so it goes through the
`node_modules` of the package that depends on `@navecss/core`. VS Code reads the file at
startup, so reload the window once it is installed.

**Stylelint.** To have `@nave` accepted without disabling `at-rule-no-unknown` for anything
else, declare it under `languageOptions.syntax.atRules`:

```json
{ "languageOptions": { "syntax": { "atRules": { "nave": { "prelude": "<custom-ident>+" } } } } }
```

This needs stylelint 16.17.0 or later. `@navecss/stylelint-config`'s own peer range is
`^17.0.0`; the two are stated separately because the config does more than this one line, and
this line works on its own, with no config installed, from 16.17.0 on. For a check that values
on a list of properties (colour, spacing and others) use a `var()` or an admitted keyword, extend
[`@navecss/stylelint-config`](https://github.com/navecss/navecss/tree/main/packages/stylelint-config#readme)
beside this line; it never replaces it.

**ESLint®.** For the JSX side of the same idea — a literal class in `className`, or a literal
value on a tokenized `style` property — install
[`@navecss/eslint-plugin`](https://github.com/navecss/navecss/tree/main/packages/eslint-plugin#readme):

```js
// eslint.config.js
import nave from '@navecss/eslint-plugin'

export default [
  // ...your existing config
  nave.configs.recommended,
]
```

**Coding agents.** This package ships a guide for coding agents at `skills/navecss/SKILL.md`:
the built-in atoms, the custom properties this build emits, the layer order, and where consumer
CSS goes, for the version you have installed. No agent looks inside `node_modules` on its own,
so add a pointer to your own `AGENTS.md` (and to `CLAUDE.md` too if you have one, since Claude
Code reads `AGENTS.md` only where there is no `CLAUDE.md`):

```md
## Styling: NaveCSS

Before writing or changing CSS or a `className`, read
`node_modules/@navecss/core/skills/navecss/SKILL.md`, resolved from the
package that depends on `@navecss/core`. The Nave custom properties and
built-in atoms it lists are the only ones there are. Atoms this project
registers through `navePlugin({ extend })` are valid too, in `@nave` only,
never in `cx()`. If a name you need is in neither place, say so rather
than invent one.
```

Consumers of `@navecss/tokens` alone get no guide: it ships only in this package.

---

## Exports

| Export                       | Description                                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| `@navecss/core`              | CSS entry point — `@import url('@navecss/core')`                                                      |
| `@navecss/core/layers`       | The `@layer` order statement alone. Import it first, before any other stylesheet                      |
| `@navecss/core/no-tokens`    | Entry point for projects that generate their own Nave token layer; see the header comment in the file |
| `@navecss/core/reset`        | Reset stylesheet only. It reads Nave's custom properties, so it needs a token layer beside it         |
| `@navecss/core/atomic`       | Generated atomic CSS (global `nave-` classes)                                                         |
| `@navecss/core/cx`           | `cx()` / `cx.raw()` utilities + `AtomName` type                                                       |
| `@navecss/core/atoms`        | Atom definitions + `atomClassMap`                                                                     |
| `@navecss/core/vite`         | Vite plugin — `navePlugin()`                                                                          |
| `@navecss/core/lightningcss` | Lightning CSS adapter — `navePlugin()`, returning `expand` and `resolver`                             |
| `@navecss/core/standalone`   | The whole stylesheet in one file, with no `@import`, for projects with no bundler                     |
| `@navecss/core/postcss`      | PostCSS plugin — `navePlugin()`                                                                       |
| `@navecss/core/check`        | The survival check as a function — `check({ source })`                                                |
