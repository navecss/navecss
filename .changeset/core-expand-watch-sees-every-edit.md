---
'@navecss/core': patch
---

`navecss-core expand --watch` now rewrites `--out` for an edit the operating system never reports, such as one saved in the moment after the watch starts on macOS, by also checking the watched files every second.

An edit a file event reports now runs even when the file's modification time and size have not moved, as on a filesystem that keeps whole seconds.
