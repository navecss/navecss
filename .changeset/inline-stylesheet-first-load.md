---
'@navecss/core': patch
---

The dev server no longer reloads a page whose stylesheet is inline in its HTML on that page's
first load. The page's response now waits until the modules it loads have been read, as an
imported stylesheet already does. This needs `server.preTransformRequests`, which is on by
default: with it set to `false` Vite does not start those modules before the page asks, and the
page is still reloaded once.
