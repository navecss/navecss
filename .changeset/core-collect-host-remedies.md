---
'@navecss/core': minor
---

`@navecss/core/collect`: `buildReport()` takes an optional fourth argument, a function that
returns the remedy lines only the calling build tool can write. It is given the application's
problems, and its lines print after the lines for the application's kinds of problem and before
any package's line. Left out, the report is byte for byte what it was. The subpath is not meant
for application code.
