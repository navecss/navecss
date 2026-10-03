---
'@navecss/core': patch
---

The PostCSS plugin (`@navecss/core/postcss`) now refuses two kinds of `extend` value it did not
check in 0.2.0, so an `extend` map that built on 0.2.0 can now fail the build, with an error naming
the atom. `extend` is trusted, consumer-authored config, not sanitised input: these are correctness
fixes, closing two ways a value reached the CSS without being checked. If your build now fails
here, write the value the error names as a plain object (`{ ... }`).

- A `pseudos`, `media` or `container` value that is truthy but not a plain object (an array, a
  non-empty string), or such a declarations map inside one, is now refused; a falsy one is skipped
  and emits nothing. 0.2.0 did not check a truthy one:
  `pseudos: { ':hover': ['a; } body { display: none'] }` emitted `body { display: none }` outside
  the rule, a string where a declarations map belongs emitted one numbered declaration per
  character (`0: a; 1: b`), and a `media` or `container` value that was itself a string or an
  array was dropped with no message. It skipped most falsy values too, but `false`, `0` or `''` as
  a pseudo's declarations emitted an empty rule (`&:hover {}`), and `null` or `undefined` there,
  or as a `media` or `container` block, failed the build with a `TypeError` naming neither Nave
  nor the atom.
- An atom that is a truthy value other than a plain object (a function, an array, a non-empty
  string, a non-zero number, `true`) is now refused, even if no `@nave` directive uses it. 0.2.0
  built with such an atom as long as no directive used it. A directive that used an array, a
  non-empty string, a non-zero number or `true` failed the build, whatever `onUnknown` said, and a
  function was accepted: its `declarations` were read once to check them and again to write them,
  so a value that changed between the two reads reached the CSS unchecked. A falsy atom (`false`,
  `0`, `''`, `null`, `undefined`) is unchanged: it is skipped, and a directive that uses it reports
  an unknown atom through `onUnknown`, so `brandBox: isBrand && { declarations: { ... } }` keeps
  working.
