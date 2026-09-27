import type { ESLint, Linter } from 'eslint'

/**
 * The default export is the plugin object (R1): `meta` (with `namespace: '@navecss'`, the
 * documented `@<scope>/eslint-plugin` form — the prefix of every rule id and the `settings`
 * key), `rules`, and `configs.recommended`. `meta.version` is read from this package's own
 * manifest at load time, never typed by hand.
 */
import { createRequire } from 'node:module'

import { classChannelRule } from './rules/class-channel.ts'
import { countEscapesRule } from './rules/count-escapes.ts'
import { rawReasonRule } from './rules/raw-reason.ts'
import { styleValuesRule } from './rules/style-values.ts'

const packageJson = createRequire(import.meta.url)('../package.json') as {
  name: string
  version: string
}

const plugin: ESLint.Plugin & { meta: { namespace: string } } = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    namespace: '@navecss',
  },
  rules: {
    'class-channel': classChannelRule,
    'raw-reason': rawReasonRule,
    'count-escapes': countEscapesRule,
    'style-values': styleValuesRule,
  },
  configs: {},
}

const recommended: Linter.Config = {
  plugins: { '@navecss': plugin },
  rules: {
    '@navecss/class-channel': 'error',
    '@navecss/raw-reason': 'error',
    '@navecss/style-values': 'error',
    '@navecss/count-escapes': 'off',
  },
}

plugin.configs = { recommended }

export default plugin
