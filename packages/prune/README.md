# @navecss/prune

NaveCSS atom pruning for Next.js: a PostCSS plugin and a `next.config` wrapper that ship only the atoms the build can read a use for. On Vite you do not need it: `navePlugin()` from `@navecss/core/vite` already does this.

## Installation

```sh
npm install @navecss/core @navecss/prune
```

`@navecss/core` and `@navecss/prune` are released together, at the same version. Upgrade them together.

## Requirements

- Next.js 16.2 or later, with the App Router and the Pages Router, on Turbopack or webpack. Next.js 15 is not covered.
- `postcss` 8.
- Node 22.18 or later.
- Your browser floor in `package.json`, as `@navecss/core` asks of a Next.js project ([why it is needed](https://github.com/navecss/navecss/tree/main/packages/core#nextjs)):

```json
{
  "browserslist": ["chrome 125", "edge 125", "firefox 128", "safari 18", "ios_saf 18"]
}
```

## Setup

Next.js loads PostCSS plugins by name, so give the plugin its package name as a key, with `{}`. That works on Turbopack, Next.js 16's default, and with `next dev --webpack` and `next build --webpack`:

```js
// postcss.config.mjs
export default {
  plugins: { '@navecss/prune/postcss': {} },
}
```

Then wrap your Next.js config in `withNave()`:

```ts
// next.config.ts
import type { NextConfig } from 'next'
import { withNave } from '@navecss/prune'

const nextConfig: NextConfig = {
  // your existing options stay as they are
}

export default withNave(nextConfig)
```

This package serves only the atoms it can read a use for, in `next dev` as in `next build`. A `nave-*` class it cannot see, such as one in CMS text or one a package listed in `keepFor` applies at run time, has no rule unless its atom is listed in `keep` or in a `keepFor` entry. Run your checks, keyboard, screen-reader and automated accessibility checks included, against a production build as well as in dev, because the two can still differ: `next build`, then `next start`, or, for a static export (`output: 'export'`), the web server you deploy its output folder to. [What it cannot see](#what-it-cannot-see) says what the package reads and where dev differs.

The plugin takes no options in the PostCSS config: `keep`, `keepFor`, `cxModules`, `extend` and `onUnknown` all go in `withNave()`, so every option has one home. Options found on the PostCSS entry are reported, and the build trims with the ones `withNave()` was given.

```ts
export default withNave(nextConfig, {
  keep: ['flex', 'grid'],
})
```

Every `next build` prints `Running next.config.js provided runAfterProductionCompile ...`, even when your config is a `.ts` file. That is Next.js announcing the hook `withNave()` installs: it checks the build's CSS against the atoms the plugin read, and it prints the report and stops the build when they disagree.

To use `withNave()` with another wrapper, make it the outermost one: `export default withNave(withMDX(nextConfig))`. It keeps the `compiler.define` entries, the `compiler.runAfterProductionCompile` hook and the `webpack` function the other wrapper set, and runs theirs. Your config can be an object or a function that returns one, and an async function works too. `withNave()` adds `@navecss/core` to `transpilePackages`, and adds `turbopack: {}` when it adds a `webpack` function and your config has no `turbopack` key, since Next.js refuses a Turbopack build in that case.

On Next.js 16.3 and later, `next dev` may keep a block of its own in `AGENTS.md` and create `CLAUDE.md` as `@AGENTS.md`; put the Nave pointer in `AGENTS.md`, outside that block, and Next.js leaves it in place.

If `withNave()` is in place and the plugin is not listed, `next build` fails and names the PostCSS entry to change. `next dev` does not report it: there is no hook in dev, so it serves the full atom layer, and nothing says the plugin is missing. If `cx.dynamic()` seems to return nothing in dev, check that the plugin is listed. If the plugin is listed and `withNave()` is not, the build ships every atom, as `@navecss/core/postcss` does, and prints one line naming `withNave()`.

## Which atoms the build ships

### What it does

The plugin reads the `cx()` calls in the code your build compiles, dependencies included, and ships the rules for the atoms those calls name, for the atom of each Nave class written as text (`nave-grid` in a JSX attribute or a string in your code, say), and for the atoms you list in `keep` and `keepFor`. `srOnlyFocusable` also ships whenever `srOnly` does. Every atom ships whole. `@nave` is expanded as `@navecss/core/postcss` expands it, and a project that never calls `cx()` and writes no Nave class ships no rule from the atom layer on the CSS-first path.

So that nothing is dropped on a guess, a `cx()` call whose atoms the build cannot read fails `next build`. The build reads everything first and fails once, at the end, with a report that lists each such use with its file, line and column, then says how to fix them. It opens with the same message as on Vite, so a search for it finds one answer:

```text
2 problems in 2 files: the build cannot tell which atoms these apply, and it ships only the atoms it can read.
app/page.tsx:4:22: cx(tone): the argument is not a literal atom name.
node_modules/.pnpm/fake-ui@1.0.0/node_modules/fake-ui/dist/index.js:1:80: cx(t): the argument is not a literal atom name.
Name the atoms at the call: a string literal, a const in the same file, or a condition choosing between them, as in cx(on ? 'flex' : 'grid').
To choose by a value, call cx() once per case and pick between the results: ({ row: cx('flex'), grid: cx('grid') })[variant].
If the name comes from data the build never sees, write cx.dynamic(name) and list every atom it can take in keep in withNave().
fake-ui is a dependency, so its code is not yours to change. List the atoms its calls can produce, from its documentation, under its name in withNave(): keepFor: { 'fake-ui': ['<atom>'] }. The lasting fix is the package's: names chosen at run time go through cx.dynamic().
```

### What the build reads

It starts from the files Next.js treats as entries and follows imports: for the App Router, `page`, `layout`, `template`, `loading`, `error`, `global-error`, `not-found`, `global-not-found`, `forbidden`, `unauthorized`, `default` and `route`, with the extensions in your `pageExtensions`; `mdx-components`, `proxy`, `instrumentation` and `instrumentation-client`; the targets of `next/dynamic`; and, for the Pages Router, every file under `pages/` (`_app`, `_document`, pages and API routes), under `app/` or `src/app/` and `pages/` or `src/pages/`. It resolves imports as your project does, through `paths` in `tsconfig.json` or `jsconfig.json` and the `react-server`, node, browser and edge conditions, and it reads dependencies under `node_modules` too. TypeScript is read as written: `as`, `satisfies`, `!` and angle-bracket assertions are transparent, and an import of a type is not an import.

An import it cannot resolve is an error, because the `cx()` calls behind it are unread; the report says `the build cannot resolve this import, so it cannot read the cx() calls behind it`, and the remedy line asks you to set the alias you gave Next.js in `paths` too. A file it selects and cannot parse is an error as well, never a skip.

To choose by a value, such as a `variant` prop, call `cx()` once per case and pick between the results:

```tsx
import { cx } from '@navecss/core/cx'

const layouts = { row: cx('flex'), grid: cx('grid') }

export function List({ variant }: { variant: keyof typeof layouts }) {
  return <ul className={layouts[variant]} />
}
```

An argument is readable when the build can list its values: a string literal, `null`, `undefined`, `false` or `''`, a condition between those, or a `const` in the same file bound to one of them. A prop, a parameter, an import from another file, an array element and a spread are not, and `cx` itself must be called, never passed on.

### Names chosen at run time

When a name is known only at run time, because it comes from data, pass it to `cx.dynamic()` and list every atom it can take in `keep`:

```tsx
// next.config.ts
export default withNave(nextConfig, { keep: ['flex', 'grid'] })

// Block.tsx, whose layout comes from your CMS
import { cx, type AtomName } from '@navecss/core/cx'

export const Block = ({ layout }: { layout: AtomName }) => <div className={cx.dynamic(layout)} />
```

`cx.dynamic()` takes one name. A name listed in `keep` (or in a `keepFor` list) gets its atom's class; any other value gets none. `withNave()` hands `cx.dynamic()` the list as JSON text, once, through `compiler.define`, and a `cx.dynamic()` call with `keep` empty is an error.

### Code you import

A module that re-exports `cx`, such as a design system's `index.ts` holding `export { cx } from '@navecss/core/cx'`, is an error until you list it in `cxModules`. Write an entry as a path from the directory that holds `next.config`, an alias from your `paths`, or a package name. `@navecss/eslint-plugin` has a `cxModules` setting with the same name and entries, resolved from the directory it runs in, so write aliases or package names where those two differ.

A dependency whose `cx()` calls the build cannot read fails the build with the package named, because its code is not yours to change. List the package in `keepFor`, under its name, with the atoms its calls can produce, which its documentation should give you:

```ts
export default withNave(nextConfig, {
  keepFor: { '@acme/ui': ['flex', 'inlineFlex', 'itemsCenter'] },
})
```

Those atoms ship as if they were in `keep`. The calls the build cannot read are not changed: one that produces any other atom still puts that atom's class on the element, with no rule. A `cx.dynamic()` call in a package that the Pages Router reaches needs the package in `transpilePackages` (or `bundlePagesRouterDependencies: true`), or the build fails and says so.

### In next dev

`next dev` serves the atoms `next build` would ship for the code the plugin reads. The plugin reads every file the build would, not only the pages you have requested, and re-reads when a file changes, with no restart.

In `next dev` the same list of problems goes to the terminal running `next dev`, not to the browser: Next.js shows no error overlay for it, and the page keeps loading. An element styled only by a call on the list renders without those atoms. Keep that terminal in view, or run `next build` before you push, which stops on the list. When a later run finds nothing after one that printed, the terminal says the problems listed earlier are fixed. A wrapper with no plugin is not reported in `next dev`, as Setup says.

### What it cannot see

The build reads the JavaScript and TypeScript modules your entry files import, and nothing that reaches the page another way. A file convention a later Next.js release adds is not read until this package reads it. A `@nave` problem goes to the report, where `@navecss/core/postcss` throws; this plugin never throws, because a throw from a PostCSS plugin leaves Turbopack stuck on the failure until you restart. A module reached only through an `import()` or `require()` whose specifier is built at run time is not read either, and neither are Markdown or MDX files: `next build` prints one warning naming each `.md` or `.mdx` file it met and did not read.

When no use at all was read, because every Nave class on the site comes from where the build cannot look, `next build` warns that the atom layer holds only what `keep` and `keepFor` name.

A class this package does not read has no rule in the production stylesheet unless its atom is listed in `keep` or in a `keepFor` entry (`nave-sr-only-focusable` also has its rule whenever `nave-sr-only` has one). It reads your code by following imports from Next.js's route files, so it does not read text from a CMS or a rich-text field, HTML inserted with `dangerouslySetInnerHTML`, HTML files in `public/`, a class taken at run time from `@navecss/core/atoms`, Markdown or MDX files and the modules only they import, a module loaded through `import()` or `require()` with a specifier built at run time, or a class a package listed in `keepFor` applies at run time. An element carrying such a class renders as if the class were absent: a `nave-sr-only` or `nave-sr-only-focusable` element is shown, a `nave-hidden` or `nave-hide-*` element is displayed, and a `nave-focus-ring` element falls back to the browser's default focus indicator. A `nave-hidden` or `nave-hide-*` element that other styles also keep out of sight (moved off-screen, made transparent or clipped) stays out of sight but can take keyboard focus and is exposed to screen readers. `next dev` serves the atoms `next build` would ship for the code this package reads, so a class it does not read has no rule in dev either. Next.js can still order, merge and minify CSS differently in the build than in dev, so a page can still look and behave differently there. Before you ship, run your checks, keyboard, screen-reader and automated accessibility checks included, against the production build: `next build`, then `next start`, or, for a static export (`output: 'export'`), the web server you deploy its output folder to.

### Shipping every atom

If most of your Nave classes are written where no build reads them, such as in a CMS, listing them in `keep` may not be practical, and shipping every atom is the better trade. Swap the PostCSS key back and remove `withNave()`: put `'@navecss/core/postcss': {}` in place of `'@navecss/prune/postcss': {}` in `postcss.config.mjs`, and export your plain `nextConfig`. It gives up what this section describes: no `cx()` call is read or checked, and `cx.dynamic()` maps through every atom. Do not make this change to silence a report about your own code: fix the call, or name its atoms in `keep`.

### For package authors

If you publish components that call `cx()`, your users' builds read your code. Write every name your components choose at run time through `cx.dynamic()`, and export the atoms they can take so a user lists them in one line. The contract, with an example, is in [`@navecss/core`'s README](https://github.com/navecss/navecss/tree/main/packages/core#which-atoms-the-build-ships).

## Options

All of them go in `withNave(nextConfig, options)`, typed against `AtomName`:

| Option      | What it does                                                                                                                                   |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `keep`      | Atoms that always ship, used or not, and the atoms `cx.dynamic()` can take.                                                                    |
| `keepFor`   | By package name: the atoms a dependency's own `cx()` calls can produce.                                                                        |
| `cxModules` | Modules that re-export `cx` from `@navecss/core/cx` unchanged, as paths from the directory that holds `next.config`, aliases or package names. |
| `extend`    | Your own atoms for `@nave`, or the path of a module whose default export is them.                                                              |
| `onUnknown` | What a problem in a `@nave` directive does: `'error'` (the default) stops `next build`, `'warn'` prints it, `'ignore'` skips it.               |

`withNave()` checks its options when it is called, and throws there with a message that opens `withNave(): `. There is no `atomic: 'all'` option: shipping every atom is [a different setup](#shipping-every-atom).

## Migrating from `@navecss/core/postcss`

1. In `postcss.config.mjs`, put `'@navecss/prune/postcss': {}` in place of `'@navecss/core/postcss'`. Listing both is an error.
2. Move any options you gave the PostCSS plugin into `withNave()`.
3. Wrap your Next.js config in `withNave()`.

Run `next build`. It reports every `cx()` call it cannot read, and everything it needs from you is in that report.

This package is not affiliated with, endorsed by or sponsored by Vercel or the Next.js project.

Vercel, the Vercel design, Next.js and related marks, designs and logos are trademarks or registered trademarks of Vercel, Inc. or its affiliates in the US and other countries.
