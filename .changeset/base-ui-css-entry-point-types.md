---
'@navecss/base-ui': patch
---

A side-effect import of `@navecss/base-ui/styles.css` now type-checks under TypeScript's default side-effect import check. TypeScript 6 refused it with error 2882 because the entry point named a stylesheet and no declaration file. The export now names a declaration file that exports nothing, next to the stylesheet.
