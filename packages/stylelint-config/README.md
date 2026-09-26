# @navecss/stylelint-config

Nave's own stylelint rules, published for a consumer's project: `@nave` known to the language,
a check that values on its listed properties use a `var()` or an admitted keyword, and
a check that flags `outline: none` and `outline: 0`.

## Installation

```sh
pnpm add -D @navecss/stylelint-config
```

## Requirements

- `stylelint` `^17.0.0` (a peer dependency; the version installed in your project is the one
  that runs).
- Node `>=22.18`.

## Usage

```json
{ "extends": ["@navecss/stylelint-config"] }
```

## What it does not check

These are stated as rules, not as gaps to be filled later:

- A `var()` passes whatever it names. This package does not check whether the custom property
  it references is declared anywhere.
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
  `border: red 1px solid` is not.
- A comma-separated `transition` list is not checked.
- The `font` shorthand is, in effect, not checked.
- Each space-separated part of a value is checked on its own: `font-family: var(--x), sans-serif`
  is reported, and the report names `sans-serif`.

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

## License

MIT
