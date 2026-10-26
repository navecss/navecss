---
'@navecss/core': patch
---

The dev server no longer reloads a page whose stylesheet is inline in its HTML on that page's
first load. The page's response now waits until the modules it loads have been read, as an
imported stylesheet already does.
