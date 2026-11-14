---
'@navecss/core': patch
---

The Vite plugin now fails the build, instead of building green with an atom's rule missing, when a
package listed in `keepFor` hands Nave's `cx` out without calling it. Before this change each case
below built green and printed nothing.

- The package gives `cx` out under another name by assigning it first, with
  `export const cn = cx`, `const cn = cx; export { cn }`, `const cn = cx; export default cn`, or a
  chain of such aliases (also with `as`). A file of yours that takes that export now
  fails like a re-export of `cx` by name does, and the report names the file and the name. A
  dependency that forwards the export through an alias (`const k = cn; export { k }`) is followed
  to the file that takes it. Without a `keepFor` entry the package's line now also tells you to
  import `cx` from `@navecss/core/cx` where your code takes it.
- The package hands `cx` out where the build cannot follow it to an export: `obj.cn = cx`,
  `memo(cx)`, `{ cn: cx }`, `cx.bind(null)`, an alias that is assigned to afterwards, or a
  dynamic `import()` of `@navecss/core/cx` whose result is not only called. This fails the build
  whatever your code imports from the package, and a `keepFor` entry does not clear it. The report
  names the file and the form, says the fix is the package's, in a release of it or a patched copy:
  export `cx` by name. It points to "Which atoms the build ships". A package that imports `cx`
  dynamically and only calls it stays the package's own call and still builds green.
- A dependency takes a module that gives `cx` out in a form the build reads neither as calls only
  nor as a forward. This also fails the build whatever your code imports, with the same kind of
  line. Measured forms: `module.exports = Object.assign({}, require('./cn.js'), ...)`, a required
  module that is stored or passed on, a namespace import that is passed on, a call of another
  member of the module (`ns.helper()`, which has the module as `this` and may return it), names
  taken from a dynamic `import()` and exported again, and the
  CommonJS output of `export *` from Babel, from esbuild and from Rollup, and of `export { cn }`
  from esbuild. TypeScript's CommonJS output, and Babel's and Rollup's for `export { cn }`, are
  followed as forwards, and a dependency that only calls what it takes builds green, including
  the code TypeScript writes for `import { cn }` and `import * as ns` that is only called.

A listed package that did none of this is unchanged. A consumer who lists a package with one of
these forms and never uses the export now gets the error too; the build cannot tell that consumer
from one who does.

For a build tool that writes this report through `@navecss/core/collect`, `buildReport` also takes
`{ remedies, everyAtom }` as its fourth argument, so the line above can point to the host's own
documentation on shipping every atom; a function there is still read as `remedies`.
