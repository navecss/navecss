---
'@navecss/core': patch
---

Fix `onUnknown: 'warn'` printing nothing on Next.js's default bundler, Turbopack. Turbopack shows
no warning a PostCSS plugin raises, so an unknown atom was dropped from the page with no message,
where the README says each problem is logged. The PostCSS plugin now prints each problem to the
terminal as `file:line:column:` and the message, and raises no PostCSS warning, whenever the
`TURBOPACK` environment variable is set and not empty, which Next.js does for Turbopack;
elsewhere it still raises the PostCSS warning. The README's Next.js section now says where the
warning shows.
