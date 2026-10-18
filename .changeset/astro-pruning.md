---
'@navecss/core': minor
---

Astro: the Vite plugin now ships only the atoms it reads on Astro, where it shipped every atom
before, and it checks every stylesheet Astro ships. Add `navePlugin()` under `vite.plugins` in
`astro.config`; the README's new Astro section has the setup and what is measured (Astro 7.3.8,
Vite 8.3.3).

- Astro writes its CSS in its server build, before the browser's build runs. The plugin now
  chooses the atoms there, from everything read so far. An atom named only by code the browser
  runs, such as a `client:only` component or a `<script>` in an `.astro` file, fails the build
  and names the module; list the atom in `keep`. A dependency the server build leaves external is
  named with `resolve.noExternal`, which reaches every environment Astro builds. In
  `output: 'server'` with prerendered pages, the stylesheet the on-demand pages share still ships
  every atom.
- The end-of-build checks now also read the stylesheets Astro writes into the page instead of as
  files. A `@nave` left in a small `<style>` block used to ship there with the build green.
- In `astro dev`, the dev server serves the build's atoms once the page's scripts have loaded.
  Until then the first paint holds the stylesheet with every atom and every `@nave` unexpanded.
- On plain Vite, a builder whose server environment writes assets and builds before the
  browser's now writes that server stylesheet with only the atoms read so far, where it shipped
  every atom, and its two warnings about a dependency the build does not read name
  `resolve.noExternal` instead of `ssr.noExternal`. The browser's stylesheet and its file name are
  unchanged.
