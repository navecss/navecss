---
'@navecss/core': patch
---

In the dev server, a stylesheet that the atoms in use outgrew before the page was listening for
updates is now reloaded when the page connects, so its classes get their rules without a manual
reload. Vite drops an update sent while no page is connected, and a `<link>` stylesheet answered
before the page's script was read could be left without the rules for that script's classes.
