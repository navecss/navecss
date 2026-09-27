---
'@navecss/core': minor
---

The `@nave` directive's resolution and placement logic now lives in a host-free core, with the
PostCSS plugin as one adapter over it. This lays the ground for other build tools to support
`@nave` the same way, and changes a few edge cases in the PostCSS plugin's own behaviour:

- The directive name now matches case-insensitively on its unescaped value (`@NAVE`, `@n\61ve`
  are directives; a spelling like `@navex` still passes through unchanged).
- The directive's argument list is now read as CSS component values instead of split on
  whitespace: names glued to punctuation now report a clear diagnostic instead of silently
  gluing together (`flex, block` now diagnoses the comma and still expands both names under a
  non-failing mode).
- A directive followed by a `{}` block is now diagnosed instead of the block being silently
  dropped.
- Under the default (build-failing) mode, every problem in one stylesheet is now reported
  together in one error instead of failing on only the first one found.
- `extend` can now be a module specifier (a file path) instead of only an inline object. A
  specifier is declared to the build tool as a dependency, so a host with a persistent build
  cache correctly invalidates when the file changes — an inline object has no such visibility.
  See the package README.
- `@navecss/core/postcss` now also has a default export, for tools that load it that way.
- New: `navecss-core check` (also `@navecss/core/check`), a command that scans built CSS for a
  `@nave` directive that never got resolved — for example because a build tool's PostCSS step
  was bypassed — and fails instead of shipping a page missing the declarations it needed.

See the package README and CONSUMER-ATOMS.md for the full detail on each of these.
