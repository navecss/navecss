---
'@navecss/core': minor
---

The `@nave` directive's resolution and placement logic now lives in a host-free core, with the
PostCSS plugin as one adapter over it. This lays the ground for other build tools to support
`@nave` the same way. It also changes what the PostCSS plugin accepts and what it prints, so a
stylesheet that built before can now fail, and an error message you match on can read
differently:

- The directive name now matches case-insensitively on its unescaped value (`@NAVE`, `@n\61ve`
  are directives, and now expand where they used to reach your CSS unchanged; a spelling like
  `@navex` still passes through unchanged).
- The directive's argument list is now read as CSS component values instead of split on
  whitespace. A name glued to punctuation used to be reported as one unknown atom (`flex, block`
  as `unknown atom "flex,"`), and under `onUnknown: 'warn'` or `'ignore'` only `block` expanded.
  Now the comma itself is reported (`separate atom names with spaces`), and under those two
  modes both names expand. A comment between two names now separates them (`flex/**/block`
  expands both), where it used to make one unknown name.
- A directive with a `{}` block (`@nave flex { color: red }`) is now reported through
  `onUnknown` instead of its block being dropped with no message, so under the default
  `'error'` a stylesheet holding one now fails the build. Write the block's declarations in the
  rule itself.
- Under the default `'error'`, every problem in one stylesheet is now reported in one error
  instead of only the first one found: the first problem's message, then
  `N more in this stylesheet:` and one `line:column:` line for each of the others. The report
  covers one stylesheet, so a bundler that stops at the first failing file reports one file per
  build.
- An unknown atom is now reported at the column of its name instead of the column of the `@`:
  for `@nave nope;` indented by two spaces, column 9, where it used to be column 3.
- The unknown-atom message now suggests the nearest atom name when one is close
  (`unknown atom "flx". Did you mean "flex"?`). Only when none is close does it list the
  available atoms, on a line of their own after
  `If it is an atom of your own, pass it in the extend option.`; it used to append
  `Available: ...` to the same line every time.
- A directive placed directly inside a group rule nested in a style rule
  (`.card { @media (...) { @nave flex; } }`) keeps its message, which now adds a sentence naming
  the `& { @nave ...; }` workaround.
- `extend` can now be a path to a module instead of only an inline object. The plugin declares
  that file to PostCSS as a dependency of every stylesheet, so a host with a persistent build
  cache can see it and invalidate when the file changes; an object has no such visibility. The
  path is resolved from the directory the build runs in, the module's default export is the
  atoms object, and with a path the plugin is async: call `process(css).then(cb)`, not the sync
  `.css` getter. See CONSUMER-ATOMS.md.
- `@navecss/core/postcss` now also has a default export, for tools that load it that way.
- New: `navecss-core check` (also `@navecss/core/check`), a command that scans built CSS for a
  `@nave` directive that never got resolved (for example because a build tool's PostCSS step
  was bypassed) and fails instead of shipping a page missing the declarations it needed. See
  the package README.
