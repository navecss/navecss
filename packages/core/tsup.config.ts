import { copyFileSync } from 'node:fs'
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    atoms: 'src/atoms.ts',
    bin: 'src/bin.ts',
    check: 'src/directive/check.ts',
    collect: 'src/collect.ts',
    cx: 'src/cx.ts',
    lightningcss: 'src/lightningcss.ts',
    postcss: 'src/postcss.ts',
    vite: 'src/vite.ts',
  },
  format: ['esm'],
  dts: true,
  clean: false,
  // clean: false is intentional.
  // build-css.ts runs first and writes dist/atomic.css, index.css, reset.css.
  // clean: true would delete them before tsup could finish.
  sourcemap: false,
  // splitting: true puts the atom declarations in one shared chunk that every entry needing
  // them imports; without it each of those entries inlines its own copy. cx.js needs none of
  // them because cx.ts imports the name list in src/atom-names.ts, not atoms.ts, and
  // test/dist-bundles.test.ts checks both.
  splitting: true,
  treeshake: true,
  // The two files that let `require('@navecss/core/postcss')` work are written by hand and
  // copied, not built: a second tsup format would bundle a second plugin and a second atom
  // table next to the ES module, so the shim just requires it (the dual-package hazard).
  onSuccess: () => {
    for (const file of ['postcss.cjs', 'postcss.d.cts']) {
      copyFileSync(`src/${file}`, `dist/${file}`)
    }
    return Promise.resolve()
  },
})
