---
'@navecss/core': patch
---

A Nave class a CSS Module composes from global now ships its atom. With `composes: nave-flex from global` in a `.module.css` file (or a `.module.scss`, or a Vue `<style module>` block), the Vite plugin's collection reads the class lists the module exports and ships the rule for each Nave class in them, in a build and in the dev server, where before the element was rendered with the class and no rule. Only those exported class lists are read: a Nave class that the module's stylesheet names in a selector (`:global(.nave-grid)`) is not a use, and a `?inline` import of the module is still not read.
