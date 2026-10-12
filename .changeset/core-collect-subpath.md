---
'@navecss/core': minor
---

New subpath `@navecss/core/collect`: the code the Vite plugin uses to read which atoms a module
uses (`readModule`), to print the report of the calls it cannot read (`buildReport`, with its
`REPORT_CAUSE` sentence) and to check the plugin's options (`assertOptions`). It contains no
parser: the caller hands it a syntax tree it parsed itself, so a build tool other than Vite can
read modules the same way. It is public because a package outside core imports it, and it is not
meant for application code: an application reaches the same behaviour through `navePlugin()` from
`@navecss/core/vite`, which behaves as before.
