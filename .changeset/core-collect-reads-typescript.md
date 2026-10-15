---
'@navecss/core': patch
---

`readModule` from `@navecss/core/collect` now reads a closed list of TypeScript forms as an author
writes them, so a host that parses source files without stripping their types gets, for those
forms, the verdict the stripped file gets. A type assertion around an argument or an initialiser
(`as`, `satisfies`, the non-null `!` and the angle-bracket `<T>x`) is read as the value it wraps, a
name written in a type position is no reference, and an `import type` binds nothing. A value under
an assertion is still judged like any other argument, and a report line quotes the call without its
assertions. Outside the list the reader is not promised to agree with the stripped file: an
assertion around `cx` itself (`(cx as typeof cx)('flex')`) is refused, and a string-literal type
such as `'nave-grid' | 'nave-block'` still collects `grid` and `block`. `readModule` takes the tree
with no node for a pair of parentheses, as Vite's parser returns it, and throws a `TypeError` on one
that keeps them. None of this changes what the Vite plugin reads: it reads the code after its types are gone.
