# @navecss/eslint-plugin

NaveCSS plugin for ESLint®: every deliberate escape from the
design system left as a declared, reasoned, countable act, instead of an unmarked literal
sitting beside `cx()`/`cx.raw()` that nothing checks.

## Installation

```sh
pnpm add -D @navecss/eslint-plugin
```

## Requirements

- `eslint` `^9.24.0 || ^10.0.0` (a peer dependency; `9.24.0` is the floor ESLint's own bulk
  suppressions feature needs, which the counting rule below relies on).
- `@navecss/core` `>=0.1.0 <1.0.0` (a peer dependency: the class-channel rule reads its atom
  names through `@navecss/core/atoms`).
- Node `>=22.18`.

The rules need a JSX-capable parser (`espree` with `ecmaFeatures.jsx`, or
`@typescript-eslint/parser`) — whichever your project already uses.

## Enable

```js
// eslint.config.js
import { defineConfig } from 'eslint/config'
import nave from '@navecss/eslint-plugin'

export default defineConfig([
  // ...your existing config
  nave.configs.recommended,
  {
    settings: {
      '@navecss': { allow: ['app-'] },
    },
  },
])
```

`configs.recommended` registers the plugin under the `@navecss` key and sets rules only — no
`languageOptions`, `files` or `settings` — so it composes with whatever the rest of your config
already does. A later config entry that sets only a rule's severity keeps that rule's default
options; one that sets options replaces them.

## Declare your own classes

Every rule reads one shared declaration, `settings['@navecss'].allow`, so the class-channel rule
and the count agree on what is yours:

```js
settings: {
  '@navecss': {
    allow: [
      'app-', // a plain string is a PREFIX, matched with startsWith
      '/^[a-z][a-z0-9-]*(__[a-z0-9-]+)?(--[a-z0-9-]+)?$/u', // a leading "/" is a pattern (BEM, here)
    ],
  },
}
```

A string entry admits a literal class token that starts with it. An entry beginning `/` is a
pattern, written `/<source>/<flags>` with flags drawn from `d`, `i`, `m`, `s`, `u`, `v` — tested
against the whole token, never automatically anchored (so `/card/` admits `legacy-card`, and a
pattern meaning "this whole token" needs its own `^`/`$`). The default is `[]`: with nothing
declared, every undeclared literal is reported.

Two more keys of the same object:

- `cxModules`: modules of your own that re-export Nave's `cx`, so the class-channel rule
  recognises them the same way it recognises `@navecss/core/cx` (which is always recognised,
  whether or not you list a wrapper).
- `helpers`: names of class-composition helpers (`clsx`, `classnames`, `cn` and any `cx` not
  bound to Nave's are the default) to check through their arguments rather than pass or flag
  outright.

## Count your escapes

`@navecss/count-escapes` is `off` in `recommended`. Turn it on to hold the number of `cx.raw()`
escapes as a CI number, using ESLint's own bulk-suppressions file:

```js
{ rules: { '@navecss/count-escapes': 'error' } }
```

```sh
eslint --suppress-rule @navecss/count-escapes
```

commits `eslint-suppressions.json` with the current count. A new escape then fails the run; so
does a removed one, until `eslint --prune-suppressions` rewrites the file — the number moves
only in a reviewed diff. This needs ESLint `9.24.0` or later and the rule at `error`: a bulk
suppression is never recorded for a `warn`. As a fallback that needs no cache file, `warn` plus
`--max-warnings 0` works too, but it counts every warning your config produces, not only this
rule's.

## Adopting on an existing codebase

The same bulk-suppressions mechanism is the adoption story for every rule here, not only the
count: turn `@navecss/class-channel`, `@navecss/raw-reason` and `@navecss/style-values` on at
`error`, run `eslint --suppress-rule` against each, and commit the resulting
`eslint-suppressions.json`. Every existing literal, unreasoned escape and literal style value is
then held at its current count; a new one anywhere fails the run, and the file shrinks as you
migrate.

## What it does not check

Stated as rules, not as gaps to be filled later:

- **JSX only**, at this version: Vue, Svelte, Astro, plain HTML templates and slot props
  (`classNames={{ root: '...' }}`) are outside every rule here.
- A class reached through a function's return value, an imported constant, a variable beyond one
  `const` hop, or a call to a helper not in `settings['@navecss'].helpers` is not seen.
- A camelCase string passed to `cx()` passes only if it names a real atom of the **installed**
  `@navecss/core` — a name registered through `navePlugin({ extend })` is not in `cx()`'s map and
  is reported.
- A literal routed through a custom property (`style={{ '--w': 'legacy-card' }}`) is not seen by
  the style rule: setting a custom property per element is lawful.
- The counting rule's denominator is exactly what `@navecss/raw-reason` counts in the linted
  files — see above for what that excludes.

## Rules

| Rule                     | Description                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `@navecss/class-channel` | A literal class in `className`/`class` must be declared or a real `cx()` atom            |
| `@navecss/raw-reason`    | A `cx.raw()` call carrying undeclared class text needs a `nave-escape` reason comment    |
| `@navecss/count-escapes` | Off by default; reports every escape and disable comment, for ESLint's bulk suppressions |
| `@navecss/style-values`  | A literal value in a JSX `style` object, on a property the design system tokenizes       |

## Trademark

ESLint® is a registered trademark of the OpenJS Foundation. This package is not affiliated with or endorsed by the OpenJS Foundation or the ESLint project.
