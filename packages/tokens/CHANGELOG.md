# @navecss/tokens

## 0.2.0

### Minor Changes

- 314680e: `@navecss/tokens` (and `@navecss/tokens/js`) now exports a type, `ColorPropertyName`: the union of every `--nave-color-*` custom-property name the stylesheet defines, the `--nave-color-tint` seed included. Use it to type-check a colour property name you pass to `element.style.setProperty()`, `getPropertyValue()` or your own override tooling, so a typo or a name the stylesheet no longer defines fails at compile time instead of silently doing nothing. It is a type only: nothing is added to `tokens` or to any runtime export, and colour values stay in `@navecss/tokens/css`, where the browser resolves them for the active colour scheme. `TokenName` and `TokenValue` are unchanged, and no name belongs to both `TokenName` and `ColorPropertyName`; write `TokenName | ColorPropertyName` for every typed Nave name.
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

### Patch Changes

- 9695371: Parsing a theming seed and scanning a `validate --source` stylesheet no longer slow down sharply on unusual input. A `--seed` colour whose channel list held a very long run of spaces or tabs between two values took time growing with the square of that run, and so did a stylesheet passed to `navecss-tokens validate --source` (or to `validate()` from `@navecss/tokens/build`) containing a very long run of dashes or many unclosed `/*` comments. All three now take time in proportion to the input. `validate` also no longer counts a name that only appears inside a longer one, such as `--primary` in `.btn--primary:hover`, as a declared custom property; a real declaration such as `--nave-color-surface-base: white` is read exactly as before.

## 0.1.1

### Patch Changes

- 180a423: `navecss-tokens build` now warns when the installed `@navecss/core` is not the version this package's core contract was recorded against, the same check `navecss-tokens validate` already made. Until now `build` finished normally in that case and said nothing about the mismatch, although the `tokens.css` it wrote could be missing custom-property names the installed `@navecss/core` reads. The warning goes to stderr, alongside the usual `Built from seed` summary on stdout, and names both versions. It is advisory only: `build`'s exit code never changes because of it, and no warning is printed when no `@navecss/core` is installed or its version cannot be read. Called through the JavaScript API, `build()` prints nothing and returns the same fact as `versionSkew` (`recorded`, `installed` and `producerName`), which is `undefined` when the versions match or cannot be compared. `@navecss/tokens/build` also exports `formatVersionSkewFact(producerName, versionSkew)`, which turns that field into the same description of the mismatch the command prints; its wording may change in any release, so decide what to do from the field, not from the text. `validate`'s version-skew message now names the core contract this package ships instead of "this manifest"; what it reports is unchanged.
