---
'@navecss/core': patch
---

`readModule` from `@navecss/core/collect` now reads TypeScript as an author writes it, so a host
that parses source files without stripping their types gets the verdict the stripped file gets. A
type assertion around an argument or an initialiser (`as`, `satisfies`, the non-null `!` and the
angle-bracket `<T>x`) is read as the value it wraps, a name written in a type position is no
reference, and an `import type` binds nothing. A value under an assertion is still judged like any
other argument, and a report line quotes the call without its assertions. The Vite plugin is
unchanged: it reads the code after its types are gone.
