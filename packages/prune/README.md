# @navecss/prune

NaveCSS atom pruning for Next.js: a PostCSS plugin and a `next.config` wrapper that ship only the atoms the build can read a use for. On Vite you do not need it: `navePlugin()` from `@navecss/core/vite` already does this.

## Installation

This package is not on npm yet.

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
