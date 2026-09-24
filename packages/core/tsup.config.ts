import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    atoms: 'src/atoms.ts',
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
})
