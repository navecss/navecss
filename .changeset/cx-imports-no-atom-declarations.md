---
'@navecss/core': patch
---

Importing only `cx` no longer pulls every atom's CSS declarations into your bundle. `cx()` needs a name-to-class map and nothing else, but that map was built from the declarations object, so a bundler could not drop it: a bundle that imports `cx` alone was 4.4 KB minified and is now 1.2 KB. `atomClassMap`, `toClassName` and `AtomName` are unchanged and still exported from `@navecss/core/atoms`.
