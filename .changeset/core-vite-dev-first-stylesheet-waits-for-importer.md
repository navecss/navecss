---
'@navecss/core': patch
---

The Vite dev server no longer serves the first stylesheet response with an empty set of atoms when the stylesheet is transformed before the script that imports it has finished its own transform (Vite's warm-up does this under load). A stylesheet a script imports now waits for the graph whether or not that import is registered yet; a stylesheet a page links is still answered at once. A first paint that came without its rules is fixed; builds were never affected.
