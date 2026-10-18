---
'@navecss/base-ui': patch
---

Combobox: `Combobox.createItems` is no longer exported. Base UI added `createItems` in 1.8.0, and
this package supports Base UI from 1.3, so on Base UI 1.3 to 1.7 the Combobox in 0.2.0 read a name
that Base UI does not export. webpack 5 stops the build on that, and so does `next build --webpack`,
for every app that imports Combobox from `@navecss/base-ui` or `@navecss/base-ui/combobox`, whether
or not the app calls `createItems`. Vite 7 and 8 only warned; esbuild and Turbopack stayed silent.
The 0.2.0 notes called this a harmless bundler warning; under webpack it is a failed build.

If you never called `Combobox.createItems`, updating is the whole fix. If you did (it works on Base
UI 1.8.0 or later), import it from Base UI and pass the result to `items` on this package's
`Combobox.Root`:

```ts
import { Combobox as BaseCombobox } from '@base-ui/react/combobox'

const fruits = BaseCombobox.createItems(items, { getValue, getLabel })
```

A test now checks every name the built wrappers read from Base UI against what Base UI 1.3.0
exports, so a name that only a later Base UI exports is caught before release.
