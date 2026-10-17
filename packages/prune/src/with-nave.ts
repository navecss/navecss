/**
 * `withNave()`: wraps `next.config` so the build reads which atoms the code uses. It hands the
 * options to the PostCSS plugin through one environment variable, gives `cx.dynamic()` its map as
 * JSON text through `compiler.define`, and adds `@navecss/core` to `transpilePackages`.
 */
import { atomClassMap } from '@navecss/core/atoms'

import type { Handoff } from './handoff.ts'
import type { NaveOptions } from './options.ts'

import { encodeHandoff, HANDOFF_VARIABLE } from './handoff.ts'
import { assertNaveOptions } from './options.ts'

/**
 * The constant `cx.dynamic()` reads its map from when a bundler defines it.
 */
const KEEP_CONSTANT = '__NAVE_KEEP_CLASSES__'

const CORE_PACKAGE = '@navecss/core'

/**
 * What a Next.js config holds that `withNave()` reads or sets. The rest is kept as it is.
 */
interface ConfigShape {
  compiler?: Record<string, unknown> & { define?: Record<string, string> }
  distDir?: string
  outputFileTracingRoot?: string
  transpilePackages?: string[]
  turbopack?: Record<string, unknown> & { root?: string }
  webpack?: (config: unknown, context: { dir?: string }) => unknown
}

/**
 * The text `compiler.define` carries: a JSON object from each atom `keep` and every `keepFor`
 * list names to its class. An empty map is `{}`, never left out.
 */
function keepMapText(options: NaveOptions): string {
  const names = new Set([...(options.keep ?? []), ...Object.values(options.keepFor ?? {}).flat()])
  const sorted = [...names].toSorted((a, b) => a.localeCompare(b))
  const map: Record<string, string> = {}
  for (const name of sorted) map[name] = atomClassMap[name]
  return JSON.stringify(map)
}

/**
 * Puts the hand-off for `config` in the environment, for the PostCSS plugin to read.
 */
function setHandoff(config: ConfigShape, options: NaveOptions, dir: string): void {
  const handoff: Handoff = {
    options,
    dir,
    distDir: config.distDir ?? '.next',
    root: config.turbopack?.root ?? config.outputFileTracingRoot ?? dir,
  }
  process.env[HANDOFF_VARIABLE] = encodeHandoff(handoff)
}

/**
 * `list` with `name` added unless it is there.
 */
function withName(list: readonly string[] | undefined, name: string): string[] {
  return list?.includes(name) === true ? [...list] : [...(list ?? []), name]
}

/**
 * The config with Nave's settings in it: the hand-off, the define, `transpilePackages`, and a
 * `webpack` function that passes webpack's project directory on. It sets `turbopack: {}` unless
 * the config has a `turbopack` key, because Next.js refuses a Turbopack build whose config has a
 * `webpack` function and none.
 */
function wrapConfig(config: ConfigShape, options: NaveOptions): ConfigShape {
  setHandoff(config, options, process.cwd())
  const user = config.webpack
  return {
    ...config,
    compiler: {
      ...config.compiler,
      define: { ...config.compiler?.define, [KEEP_CONSTANT]: keepMapText(options) },
    },
    transpilePackages: withName(config.transpilePackages, CORE_PACKAGE),
    ...(config.turbopack === undefined && { turbopack: {} }),
    webpack: (webpackConfig: unknown, context: { dir?: string }) => {
      if (context.dir !== undefined) setHandoff(config, options, context.dir)
      return user ? user(webpackConfig, context) : webpackConfig
    },
  }
}

/**
 * Wraps a Next.js config (an object, or a function of the phase, sync or async).
 * @param config The config `next.config` exports.
 * @param options The options for which atoms ship.
 * @returns The same kind of config, with Nave's settings in it.
 */
export function withNave<Config extends object>(config: Config, options: NaveOptions = {}): Config {
  assertNaveOptions(options)
  if (typeof config !== 'function') return wrapConfig(config, options) as Config
  const wrapped = (...args: unknown[]): unknown => {
    const resolved: unknown = (config as (...rest: unknown[]) => unknown)(...args)
    if (!(resolved instanceof Promise)) return wrapConfig(resolved as ConfigShape, options)
    return (async () => wrapConfig((await resolved) as ConfigShape, options))()
  }
  return wrapped as Config
}
