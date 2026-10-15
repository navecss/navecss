# @navecss/prune

NaveCSS atomic CSS for Next.js, pruned to the atoms your build reads a use of: a PostCSS plugin and a `next.config` wrapper that drop the `@layer atomic` rules no `cx()` call or written `nave-*` class asks for. On Vite, [`@navecss/core/vite`](https://github.com/navecss/navecss/tree/main/packages/core#vite-plugin-setup) does the same and you do not need this package.

## Installation

```sh
npm install @navecss/prune
```

It needs `@navecss/core`, `next` 16.2 or later, `postcss` 8 and Node 22.18 or later.

## Setup

List the plugin in the PostCSS config in place of `@navecss/core/postcss`, with `{}`: every option belongs to `withNave()`.

```js
// postcss.config.mjs
export default {
  plugins: { '@navecss/prune/postcss': {} },
}
```

Wrap `next.config` in `withNave()`:

```js
// next.config.mjs
import { withNave } from '@navecss/prune'

export default withNave({}, { keep: ['hidden'] })
```

## Exports

| Export                        | What it is                                                                             |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| `@navecss/prune`              | `withNave(nextConfig, options)`: hands the options to the plugin and sets up the build |
| `@navecss/prune/postcss`      | The PostCSS plugin: expands `@nave` and keeps the atoms the code reads                 |
| `@navecss/prune/package.json` | The package manifest                                                                   |

This package is not affiliated with, endorsed by or sponsored by Vercel or the Next.js project.

Vercel, the Vercel design, Next.js and related marks, designs and logos are trademarks or registered trademarks of Vercel, Inc. or its affiliates in the US and other countries.
