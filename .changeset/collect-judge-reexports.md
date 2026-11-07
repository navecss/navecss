---
'@navecss/core': minor
---

`@navecss/core/collect` exports `judgeReexports()`, the build-end read of which re-exports of `cx`
in a package listed in `keepFor` stay errors because code in your project takes the `cx` the package
gives out. It reads the module graph of any host, through a small interface the caller supplies, and
the Vite plugin calls the same function, so its output is unchanged. The subpath is not meant for
application code.
