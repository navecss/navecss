---
'@navecss/core': patch
---

The PostCSS plugin (`@navecss/core/postcss`) now refuses two kinds of `extend` value it did not
check in 0.2.0, so an `extend` map that built on 0.2.0 can now fail the build, with an error naming
the atom. `extend` is trusted, consumer-authored config, not sanitised input: these are correctness
fixes, closing two ways a value reached the CSS without being checked. If your build now fails
here, write the value the error names as a plain object (`{ ... }`).

- A `pseudos`, `media` or `container` value that is not a plain object (an array, a string), or a
  declarations map inside one that is not, is now refused. 0.2.0 did not check such a value:
  `pseudos: { ':hover': ['a; } body { display: none'] }` emitted `body { display: none }` outside
  the rule, a string where a declarations map belongs emitted one numbered declaration per
  character (`0: a; 1: b`), and a `media` or `container` value that was itself a string or an
  array was dropped with no message.
- An atom that is not a plain object (a function, an array, a string or a number) is now refused,
  even if no `@nave` directive uses it. 0.2.0 refused an array or a primitive only at a directive
  that used it, and accepted a function, reading its `declarations` once to check them and again to
  write them, so a value that changed between the two reads reached the CSS unchecked.
