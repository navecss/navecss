---
'@navecss/core': patch
---

In the dev server, a stylesheet that the atoms in use outgrew before the page was listening for
updates is now reloaded when the page connects, so its classes get their rules without a manual
reload. Vite drops an update sent while no page is connected, and a `<link>` stylesheet answered
before the page's script was read could be left without the rules for that script's classes.

A stylesheet inlined in `index.html` now reloads the page when the atoms in use outgrow it. Its text
is part of the HTML the page was given, so the page has to be reloaded to get the new rules; the
reload Vite sent for it named the HTML file by its file-system path, which Vite's client ignores,
so a class a module added later had no rule for the rest of the session.
