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

ES modules only, with no CommonJS build: load it with `import`, or with `require()` (an
`eslint.config.cjs`) on Node 22.18 or later, where the plugin is the module's `default` export:
`const nave = require('@navecss/eslint-plugin').default`.

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

A later config entry that sets one of these keys replaces that key's whole value, arrays
included; one that sets only a different key of the same `settings['@navecss']` object leaves
this one as it was.

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
rule's. A file-wide or block `eslint-disable` comment with no rule list silences every rule
after it in that file, this one included, so a file that opens with a bare `/* eslint-disable */`
is never in the count at all.

Three more limits come from how ESLint itself applies directives and records suppressions, which
no rule can see past:

- A same-line `// eslint-disable-line` that names no rule, or names `@navecss/count-escapes`,
  with or without a `-- description`, silences every report on its line, this rule's report
  about the comment included, so neither the comment nor an escape on that line is counted. One
  naming only other rules of this plugin is counted, at the comment.
- The count is one per escape, a disable comment and a `cx.raw()` call alike, and the
  suppressions file records a count per file per rule, so replacing a counted escape with a
  counted disable comment in the same file leaves `eslint-suppressions.json` unchanged: the swap
  shows in the source diff only.
- An inline configuration comment turning the counting rule off
  (`/* eslint @navecss/count-escapes: "off" */`) is not counted and hides its file's escapes. In
  a file `eslint-suppressions.json` already records, the next run fails on unused suppressions
  until pruned, so the drop reaches a reviewed diff; in a file it does not record, nothing shows.

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
- A `cxModules` wrapper is recognised through its `cx` export only: one that re-exports Nave's
  `cx` under another name, or as its default export, is not seen as Nave's `cx`.
- `cx.raw` is recognised as `cx.raw`, `cx['raw']`, ``cx[`raw`]``, a namespace import's
  `c.cx.raw`, or one `const` alias: a call reached any other way, such as `(0, cx.raw)(...)` or
  `cx.raw.call(...)`, is not seen by either rule.
- A camelCase string passed to `cx()` passes only if it names a real atom of the **installed**
  `@navecss/core` — a name registered through `navePlugin({ extend })` is not in `cx()`'s map and
  is reported.
- A literal routed through a custom property (`style={{ '--w': 'legacy-card' }}`) is not seen by
  the style rule: setting a custom property per element is lawful.
- A CSS shorthand that is not itself on the style rule's checked property list (`background`,
  `border` and its sides, `font`, `transition`, `animation`, and any other) is not checked, even
  though `@navecss/stylelint-config`'s own config reports it by expanding the shorthand into the
  longhands it sets.
- The counting rule's denominator is exactly what `@navecss/raw-reason` counts in the linted
  files — see above for what that excludes.

## Rules

| Rule                     | Description                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `@navecss/class-channel` | A literal class in `className`/`class` must be declared or a real `cx()` atom             |
| `@navecss/raw-reason`    | A `cx.raw()` call carrying undeclared class text needs a `nave-escape` reason comment     |
| `@navecss/count-escapes` | Off by default; reports every escape and disable comment, for ESLint's bulk suppressions  |
| `@navecss/style-values`  | A literal value in a JSX `style` object, on a listed property the design system tokenizes |

### Rule 1: the class channel

`@navecss/class-channel` reads a JSX `className` or `class` value and reports each literal class
that is not declared as your own, and each argument of `cx()` that is not one atom name. A helper
call is read through its arguments; a `cx.raw()` call is left to the next rule.

### Rule 2: the `cx.raw()` reason

`@navecss/raw-reason` reports a `cx.raw()` call that carries literal class text the class channel
would report anywhere else, unless the first thing inside its parentheses is a reason:
`cx.raw(/* nave-escape: vendor date picker renders this class */ 'legacy-card')`.

### The count

`@navecss/count-escapes`, `off` in `recommended`: see [Count your escapes](#count-your-escapes).

### Rule: style

`@navecss/style-values` checks the literal values in a JSX `style` object: its row in the table
above says what it reports, and [What it does not check](#what-it-does-not-check) what it leaves
out.
One divergence from `@navecss/stylelint-config` is deliberate: a string that is not a valid value
for its property, such as `padding: '13'` (a number with no unit) or `padding: ''`, is reported
here, while stylelint passes the same text in a stylesheet. The browser drops such a
declaration, and this rule reports it rather than parse each property's grammar.

## Trademark

ESLint® is a registered trademark of the OpenJS Foundation. This package is not affiliated with or endorsed by the OpenJS Foundation or the ESLint project.
