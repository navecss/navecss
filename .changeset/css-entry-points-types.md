---
'@navecss/tokens': patch
'@navecss/core': patch
---

A side-effect import of a CSS entry point, such as `import '@navecss/tokens/css'` or `import '@navecss/core'`, now type-checks under TypeScript's default side-effect import check. TypeScript 6 refused it with error 2882 because the entry point named a stylesheet and no declaration file. Each CSS-only export now names a declaration file that exports nothing, next to the stylesheet it opens.
