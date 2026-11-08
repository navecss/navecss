---
'@navecss/core': patch
---

The Vite plugin now fails the build, instead of building green with an atom's rule missing, in two
cases where a package listed in `keepFor` re-exports `cx` under another name and your code takes it:

- A file of yours imports another export from that module and also takes `cx` from it by `require()`
  or `import x = require()`. The build now fails as it does for the same file without that import.
  A `createRequire()` require counts the same way. Vite does not bundle one, though, so it only has
  an effect beside an import that puts the module in the build.
- You take it through a dependency that forwards it in CommonJS, with `module.exports = require(...)`
  or `exports.cn = require(...).cn`, or with what TypeScript emits when it compiles
  `export { cn } from` or `export * from` to CommonJS (a getter defined on `exports`, or
  `__exportStar`, its own or `tslib`'s). The report now names your file, as it does for an
  `export ... from` forward.
