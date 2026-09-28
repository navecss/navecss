import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    atoms: 'src/atoms.ts',
    bin: 'src/bin.ts',
    check: 'src/directive/check.ts',
    cx: 'src/cx.ts',
    postcss: 'src/postcss.ts',
  },
  format: ['esm'],
  dts: true,
  clean: false,
  // clean: false is intentional.
  // build-css.ts runs first and writes dist/atomic.css, index.css, reset.css.
  // clean: true would delete them before tsup could finish.
  sourcemap: false,
  // splitting: true keeps the atoms object in dist/atoms.js only.
  // Without it every entry inlines its own copy of the declaration data, so
  // cx.js — which needs nothing but a name map — carried all of it (C12).
  splitting: true,
  treeshake: true,
  esbuildOptions(options) {
    // `postcss-extend-module.ts` passes its JSON-import-attributes object
    // as a variable, not an inline object literal, specifically so this
    // build's own tree-shaking pass (a second, internal Rollup bundle over
    // every emitted chunk, needed to keep `atoms.ts`'s declaration data out
    // of every entry but one, C12) never recognises it as import-attributes
    // syntax to rewrite: that pass's Rollup version always serialises the
    // syntax back out with the now Node-incompatible `assert` keyword
    // instead of `with`, regardless of which one was authored. esbuild's
    // own, unrelated warning about that same variable form is silenced here
    // since it is this deliberate, not a mistake to fix.
    options.logOverride = { ...options.logOverride, 'unsupported-dynamic-import': 'silent' }
  },
})
