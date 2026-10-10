---
'@navecss/eslint-plugin': patch
---

A relative `cxModules` entry (one that begins `./` or `../`, or is exactly `.` or `..`) now
matches an import only when the two resolve to the same file: the entry from the working
directory, the import from the file that writes it. Before, it also matched any import written
the same way, and in another directory that text names another file, so `cxModules: ['./ui']`
made the rules read a file's own `./ui` helper in another directory as Nave's `cx`.

A `#` import (a subpath import such as `#ds`) resolves through the `package.json` nearest the
file that writes it, so a `#` entry is matched the same way when the import resolves from that
file: it matches only when it lands on a file one of your entries names from the working
directory. An import the plugin cannot resolve, such as a `#` alias set only in TypeScript's
`paths` or in your bundler, still matches as written. Package names, subpaths, other aliases and
absolute paths match an import written the same way, as before.

An entry that matched only by its text now matches nothing: a relative entry written the way one
file spells the import, which names another file or none from the working directory, and a `#`
entry mapped only in a nested `package.json`. With the default `helpers`, the class-channel rule
then reads that file's `cx()` as a helper and reports each atom name in it. List the module by its
path from the working directory (`'./src/ui/index.js'`), or by an alias.
