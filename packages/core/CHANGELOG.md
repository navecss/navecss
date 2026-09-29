# @navecss/core

## 0.2.0

### Minor Changes

- d88fc5c: This release refuses some input that 0.1.1 accepted, so an `extend` map or a DTCG source that built on 0.1.1 can now fail the build. Before upgrading, check yours for the shapes listed below.

  `@navecss/core`: `navePlugin({ extend })` now validates your atoms when the plugin is created; 0.1.1 did not check their CSS strings at all and emitted them as written. Every declaration, pseudo selector key and `media`/`container` condition in an `extend` atom must parse as exactly that one CSS construct, or the build fails with an error naming the atom, even if no `@nave` directive uses it. Newly refused: a value that ends its declaration or rule and starts another (`red; background: blue`), a value ending in `;`, and a value carrying a CSS comment, even a closed one (`red /* note */`). Still accepted: a `;`, `{` or `/*` inside a string or a `url()`, leading or trailing whitespace, and `!important`. A comment in a pseudo selector key is accepted and now read as a comment: 0.1.1 took an `&` inside one (`/* note & */:hover`) as the key's anchor, so it matched a descendant instead of the same element, and split the key at a comma inside a comment.

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

- f616c71: Ships `skills/navecss/SKILL.md`, an Agent Skills guide generated from the atom source and the resolved token/palette data: every built-in atom with its declarations and variants, every `--nave-*` custom property with its description where one exists, the `@layer` order, and the `@nave`/`cx()`/`cx.raw()` idiom. No coding agent discovers a file under `node_modules` on its own, so reach it through a pointer block in your project's `AGENTS.md` (documented in a later change) rather than expecting it to load automatically.
- 7c49380: Ships `nave.css-data.json`, a CSS custom-data file generated from the atom source that declares the `@nave` at-rule to VS Code's CSS language service. Point `css.customData` at it and the editor stops reporting `@nave` as an unknown at-rule, still catches a misspelt one, and on hover describes `@nave` and lists the built-in atom names by section. The file adds no atom-name suggestions as you type. `ATOMS.md`'s Variants column now also renders each pseudo-class, `@media` and `@container` variant's own declarations beside its selector, rather than the selector alone.

### Patch Changes

- f616c71: `ATOMS.md` now shows `disabledState`'s aria-disabled note in the atom's own row, beside the declarations it applies to.
- cc4c78b: Updates the `cx()` documentation (the README's "Escape hatch" section and `cx.ts`'s own docblock) to name `@navecss/eslint-plugin`, which now checks the rest of the `className` attribute — a bare string sitting beside `cx()`/`cx.raw()` is no longer unchecked once that plugin is installed. No runtime behaviour changes.
- f616c71: The README's layer-order paragraph now says that `!important` reverses the order, so an `!important` in `overrides` does not beat Nave's own layers.
- Updated dependencies [314680e]
- Updated dependencies [d88fc5c]
- Updated dependencies [9695371]
  - @navecss/tokens@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [180a423]
  - @navecss/tokens@0.1.1
