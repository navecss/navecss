---
'@navecss/core': minor
'@navecss/tokens': minor
---

This release refuses some input that 0.1.1 accepted, so an `extend` map or a DTCG source that built on 0.1.1 can now fail the build. Before upgrading, check yours for the shapes listed below.

`@navecss/core`: `navePlugin({ extend })` now validates your atoms when the plugin is created; 0.1.1 did not check their CSS strings at all and emitted them as written. Every declaration, pseudo selector key and `media`/`container` condition in an `extend` atom must parse as exactly that one CSS construct, or the build fails with an error naming the atom, even if no `@nave` directive uses it. Newly refused: a value that ends its declaration or rule and starts another (`red; background: blue`), a value ending in `;`, and a value carrying a CSS comment, even a closed one (`red /* note */`). Still accepted: a `;`, `{` or `/*` inside a string or a `url()`, leading or trailing whitespace, and `!important`.

`@navecss/tokens`: the DTCG reader (`navecss-tokens build`, and `build()` from `@navecss/tokens/build`) now refuses these source shapes, all accepted by 0.1.1, with an error naming the token:

- A key starting with `$` other than the metadata keys (`$value`, `$type`, `$description`, `$extensions`, `$deprecated`, `$ref`). 0.1.1 skipped it along with everything under it. `$root` and `$extends` (DTCG 2025.10 §6.2, §6.4) are named as not supported yet, with how to convert them.
- A key containing a `.`, which a DTCG 2025.10 name may not contain (§5.1.1). A lone one used to build; one that coincides with a nested path (`"b.c"` in `a`, and `c` in `a.b`) could not be told apart from it.
- A token that also has child tokens. 0.1.1 dropped the children.
- A raw string value containing `;` or `/*`. 0.1.1 wrote it into the generated CSS as is.
- An alias chain longer than 1000 links. 0.1.1 overflowed the call stack.

Also in `@navecss/tokens`:

- `build --out` pointing at an existing file (or a similar path conflict), and a broken install (the package's own built manifest missing), now exit 2 with a message naming the problem instead of 1 with a raw filesystem error; `build()` and `validate()` reject with the exported `UsageError`. Other write failures still surface as themselves.
- A CLI flag given twice is now refused instead of silently using the last value.
- In the generated CSS, the `layer` (stacking-order) tokens register as `<integer>` instead of `<number>`, so a fractional override can no longer produce an invalid `z-index`, and the neutral ramp pins its alpha to `1`, so a semi-transparent `--nave-color-tint` no longer makes every neutral surface semi-transparent.
