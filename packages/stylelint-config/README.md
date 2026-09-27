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

This package flags a `var(--nave-*)` reference whose name is not declared anywhere in your
token stylesheet, through its own rule: `@navecss/declared-custom-properties`. "Declared" means
a plain `--nave-*` declaration somewhere in that stylesheet — at its top level, inside `@layer`,
inside `@media`, inside a nested rule — never a name merely declared in the file being linted:
declaring your own `--nave-*` custom property locally does not exempt a reference to it
elsewhere.

By default it reads `@navecss/tokens/css`, the stylesheet `@navecss/tokens` itself publishes.
Point it at a stylesheet of your own instead with the rule's `stylesheet` option:

```json
{
  "rules": {
    "@navecss/declared-custom-properties": [true, { "stylesheet": "./src/tokens.css" }]
  }
}
```

A path there resolves from the working directory you run stylelint from. Either way, the
stylesheet must exist before lint runs: one that is missing or unreadable, default or named,
fails the run with a configuration error rather than linting anything.

If you run stylelint with `--cache` and later change a stylesheet you named with this option,
clear the cache. Stylelint's own cache key is the resolved config plus its version, never the
bytes of a file this rule merely reads by path, so a stale cache entry can go on reporting last
run's verdict for a custom property that no longer exists, or none at all for one just added.
The default stylesheet does not have this problem: this package carries a digest of its content
in the rule's own options, so a change there changes the config itself.

To turn this check off, set `@navecss/declared-custom-properties` to `null` in your own config,
or disable it for one declaration with a stylelint disable comment.

## License

MIT
