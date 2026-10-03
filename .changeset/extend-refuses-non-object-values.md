---
'@navecss/core': patch
---

The PostCSS plugin (`@navecss/core/postcss`) now refuses three kinds of `extend` value it did not
check in 0.2.0, so an `extend` map that built on 0.2.0 can now fail the build, with an error naming
the atom. `extend` is trusted, consumer-authored config, not sanitised input: these are correctness
fixes, closing three ways a value reached the CSS without being checked. If your build now fails
here, write the value the error names as a plain object (`{ ... }`).

- A `pseudos`, `media` or `container` value that is a function, an array, a non-empty string, a
  non-zero number, `true` or a boxed primitive such as `new String('x')`, or a declarations map
  inside one that is any of these, is now refused; a falsy one is skipped and emits nothing. 0.2.0
  did not check them: `pseudos: { ':hover': ['a; } body { display: none'] }` emitted
  `body { display: none }` outside the rule, a string or a `String` object where a declarations
  map belongs emitted one numbered declaration per character (`0: a; 1: b`), and a `media` or
  `container` value that was itself a string or an array was dropped with no message. It skipped
  most falsy values too, but `false`, `0` or `''` as a pseudo's declarations emitted an empty rule
  (`&:hover {}`), and `null` or `undefined` there, or as a `media` or `container` block, failed
  the build with a `TypeError` naming neither Nave nor the atom.
- An atom that is a function, an array, a non-empty string, a non-zero number, `true` or a boxed
  primitive such as `new String('x')` is now refused, even if no `@nave` directive uses it. 0.2.0
  built with such an atom as long as no directive used it. A directive that used an array, a
  non-empty string, a non-zero number, `true` or a boxed primitive failed the build, whatever
  `onUnknown` said, and a function with a `declarations` property was accepted: its
  `declarations` were read once to check them and again to write them, so a value that changed
  between the two reads reached the CSS unchecked. A falsy atom (`false`, `0`, `''`, `null`,
  `undefined`) is unchanged: it is skipped, and a directive that uses it reports an unknown atom
  through `onUnknown`, so `brandBox: isBrand && { declarations: { ... } }` keeps working.
- An atom's own `declarations` that is a function, an array, a non-empty string, a non-zero
  number, `true` or a boxed primitive is now refused too, even if no `@nave` directive uses the
  atom. 0.2.0 built with it as long as no directive used the atom, and a directive that used it
  failed the build, except that a `String` object emitted one numbered declaration per character
  (`0: a; 1: b`) and any other boxed primitive added nothing. A missing or falsy `declarations` is
  unchanged: it fails the build only at a directive that uses the atom.
