---
'@navecss/tokens': patch
'@navecss/core': patch
'@navecss/base-ui': patch
---

A side-effect import of a CSS entry point, such as `import '@navecss/tokens/css'`, `import '@navecss/core'` or `import '@navecss/base-ui/styles.css'`, now type-checks under TypeScript's default side-effect import check. TypeScript 6 refused it with error 2882 because the entry point named a stylesheet and no declaration file. Each CSS-only export now names a declaration file that exports nothing, next to the stylesheet it opens.
