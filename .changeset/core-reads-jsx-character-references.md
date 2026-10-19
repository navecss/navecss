---
'@navecss/core': patch
---

The atom reader behind the Vite plugin and `@navecss/core/collect` now reads a class written with a numeric character reference in a JSX attribute, such as `className="nave&#45;flex"`, as the `nave-flex` it is when the page runs, where it used to miss the atom.

On Vite, a module whose only mention of an atom is such a reference is now read as well, where the plugin used to skip it unread.
