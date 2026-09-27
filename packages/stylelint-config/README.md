# @navecss/stylelint-config

Nave's own stylelint rules, published for a consumer's project: `@nave` known to the language,
a check that values on its listed properties use a `var()` or an admitted keyword, a check that
flags `outline: none` and `outline: 0`, and a check that a `var(--nave-*)` reference names a
custom property declared in your token stylesheet.

## Installation

```sh
pnpm add -D @navecss/stylelint-config
```

## Requirements

- `stylelint` `^17.0.0` (a peer dependency; the version installed in your project is the one
  that runs).
- `@navecss/tokens` `>=0.1.0 <1.0.0` (a peer dependency, needed for the declared-custom-properties
  check's default stylesheet — see below).
- Node `>=22.18`.

## Usage

```json
{ "extends": ["@navecss/stylelint-config"] }
```

## What it does not check

These are stated as rules, not as gaps to be filled later:

- A `var()` passes whatever it names, as far as the check above is concerned: it does not look
  at whether the custom property it references is declared anywhere. A `--nave-*` reference is
  checked separately, by the rule described in "Declared custom properties" below.
- A `var()` fallback is not checked either: `color: var(--x, red)` and
  `padding: var(--x, 13px)` pass.
- A preprocessor variable, a name starting with `$` or `@`, is not checked: `color: $red`,
  `color: @red` and `padding: $space` pass.
- A function consuming a `var()` passes even with a literal elsewhere in it, for example
  `light-dark(#fff, var(--x))`.
- Properties outside its own list are not checked. The list lives in
  [`index.js`](index.js); it is linked here, never copied, so this file cannot drift from it.
- A rule your own stylelint config also sets replaces this package's setting for that rule,
  the way `extends` always composes: it does not merge with it.
- Shorthands are expanded by POSITION, not by grammar: a literal inside a shorthand is reported
  only where it sits in its longhand's position. `border: 1px solid red` is reported;
  `border: red 1px solid` is not. Leaving a part out moves the parts after it, so
  `border: 1px red` and `text-decoration: underline red` are not reported either.
- The logical border shorthands are not expanded at all, so nothing inside one is checked:
  `border-block: 1px solid red` and `border-inline-start: 1px solid red` pass, although
  `border-block-color: red` written on its own is reported.
- A comma-separated `transition` list is not checked.
- The `font` shorthand is, in effect, not checked.
- Each space-separated part of a value is checked on its own: `font-family: var(--x), sans-serif`
  is reported, and the report names `sans-serif`.
- An unpaired `'` or `"` inside a comment with no space on either side of it, as in
  `margin: var(/* it's */--x) 13px`, joins the rest of the value into one part. On a shorthand
  nothing in that part is reported; on any other property it passes whenever it holds a `var()`,
  and is otherwise reported whole.

## Adopting it on an existing codebase

Use stylelint's own `overrides` to phase it in by path, rather than fixing every file at once:

```json
{
  "overrides": [
    {
      "files": ["src/new/**/*.css"],
      "extends": ["@navecss/stylelint-config"]
    }
  ]
}
```

## The outline guard

This package flags `outline: none` and `outline: 0`, through stylelint's
`declaration-property-value-disallowed-list` rule. To turn it off, set that rule to `null` in
your own config, or disable it for one declaration with a stylelint disable comment. Setting that
rule to anything else in your own config also replaces this check, as described above.

## Declared custom properties

This package flags a `var(--nave-*)` reference whose name is not declared anywhere in the
stylesheet(s) your tokens come from, through its own rule: `@navecss/declared-custom-properties`.
"Declared" means a plain `--nave-*` declaration somewhere in one of those stylesheets (at its
top level, inside `@layer`, inside `@media`, inside a nested rule), never a name merely declared
in the file being linted: declaring your own `--nave-*` custom property locally does not exempt a
reference to it elsewhere.

By default it reads `@navecss/tokens/css`, the stylesheet `@navecss/tokens` itself publishes.
Point it at a stylesheet of your own instead with the rule's `stylesheet` option.

The option takes a string or an array of strings; the declared set is the union of the stylesheets named:

```json
{
  "rules": {
    "@navecss/declared-custom-properties": [
      true,
      { "stylesheet": ["@navecss/tokens/css", "./src/theme.css"] }
    ]
  }
}
```

Naming `stylesheet` replaces the default rather than adding to it, so a project layering a theme
on top of the published tokens lists both, as above. Each entry resolves from the working directory
you run stylelint from, whether it is a path or a package specifier, and an `@import` inside a
named stylesheet is not followed: list every stylesheet your names come from, rather than one
that only imports the rest.

Either way, the stylesheet must exist before lint runs. Stylelint constructs this rule anew for
every file it checks, so this package reads (and validates) its stylesheet(s) the first time the
rule runs, not before the whole run starts, and reuses that read (memoised by path, modification
time and size) for every file after; one that is missing or unreadable, default or named, fails
the run there, on that first file, rather than linting anything.

If you run stylelint with `--cache`, clear the cache after changing, adding, removing or moving
any stylesheet you named with this option. Stylelint's own cache key is the resolved config plus
its version, never the bytes of a file this rule merely reads by path, and a run that considers a
file unchanged never asks this rule about it again, so a stylesheet you deleted or edited since
the last cold run goes unnoticed there until you clear the cache. The default stylesheet mostly
avoids this: this package carries a digest of its content in the rule's own default options, so a
change to it changes the config itself and busts the cache too. That only holds while you leave
those options alone, though: setting the rule's own options in your config, even only `severity`,
replaces them wholesale (as every stylelint rule's options do) and drops the digest with them. If
you need to set an option on this rule, spread its default entry from this package's own default
export first, so the digest survives:

```js
import config from '@navecss/stylelint-config'

const rules = {
  ...config.rules,
  '@navecss/declared-custom-properties': [
    true,
    { ...config.rules['@navecss/declared-custom-properties'][1], severity: 'warning' },
  ],
}
```

To turn this check off, set `@navecss/declared-custom-properties` to `null` in your own config,
or disable it for one declaration with a stylelint disable comment.

## License

MIT
