---
'@navecss/core': patch
'@navecss/tokens': patch
---

`@navecss/core`: an atom passed to `navePlugin({ extend })` is now checked by parsing it as the CSS it is meant to be — a declaration, a pseudo selector, or a `media`/`container` condition — rather than by refusing a fixed set of characters. A declaration value that carries a literal `;`, `{` or `/*` inside a string or a `url()` (a data URL with a `;`, a `content: ";"`) is accepted, since it never leaves the declaration; a value, pseudo key or condition that would open a second rule or declaration is refused, whether or not it uses those characters.

`@navecss/tokens`:

- A raw string token value carrying a `;` or a CSS comment opener (`/*`) is now refused rather than spliced into the generated `:root`/`@property` blocks as a second declaration.
- An alias chain longer than 1000 links is now refused with a named error instead of overflowing the call stack.
- `$root` (DTCG 2025.10 §6.2) and `$extends` (§6.4) are now named as syntax this reader does not support yet, with a conversion instruction, rather than reported as an invalid token or group name. Every other `$`-prefixed key, a dotted key, and a token carrying both a value and child tokens are still refused as before.
- `build --out` pointing at a path that already exists as a file, and a broken install (this package's own manifest missing), now exit 2 naming the actual problem instead of exiting 1 with a raw filesystem error. A write failure for any other reason (disk full, a permissions error) still surfaces as itself.
- A repeated CLI flag (`--seed` given twice, for example) is now refused instead of silently building from whichever value parsed last.
- The stacking-order (`layer`) tokens' `@property` registrations now use the CSS `<integer>` syntax instead of `<number>`, so a fractional override can no longer produce an invalid `z-index`.
- The neutral ramp's relative-colour-syntax formula now pins its own alpha to `1`, so a semi-transparent tint source no longer makes every derived neutral surface semi-transparent too.
