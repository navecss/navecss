---
'@navecss/core': patch
---

`navecss-core expand --watch` now rewrites `--out` for an edit the operating system never reports, such as one saved in the moment after the watch starts on macOS, by also checking the watched files every second.
