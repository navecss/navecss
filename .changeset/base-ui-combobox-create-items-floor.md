---
'@navecss/base-ui': patch
---

Combobox: `Combobox.createItems` is no longer re-exported. Base UI added `createItems` in 1.8.0,
and this package supports Base UI from 1.3, so on 1.3 to 1.7 the wrapper read a member that
Base UI's module does not have. webpack 5 reports that as a build error, and so does
`next build --webpack`, for every app that imports `@navecss/base-ui` or
`@navecss/base-ui/combobox` and renders a Combobox, whether or not the app uses `createItems`. The
other bundlers measured (Vite 7 and 8, esbuild, Turbopack) only warned or stayed silent.

On Base UI 1.8.0 or later, import it from Base UI and pass the result to `items` on this package's
`Combobox.Root`:

```tsx
import { Combobox as BaseCombobox } from '@base-ui/react/combobox'

const fruits = BaseCombobox.createItems(items, { getValue, getLabel })
```

A test now checks that every member the built wrappers read off a Base UI import exists in Base UI
1.3.0, so a function Base UI adds later and a wrapper reads is caught before release. The README's
paragraph about parts younger than the floor, and its note that a bundler may warn, are replaced.
