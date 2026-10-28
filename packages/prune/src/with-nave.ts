/**
 * `withNave()`: wraps `next.config` so the build reads which atoms the code uses. It hands the
 * options to the PostCSS plugin through one environment variable, gives `cx.dynamic()` its map as
 * JSON text through `compiler.define`, and adds `@navecss/core` to `transpilePackages`.
 */
import { atomClassMap } from '@navecss/core/atoms'

import type { Handoff } from './handoff.ts'
import type { HookMetadata } from './hook.ts'
import type { NaveOptions } from './options.ts'

import { encodeHandoff, HANDOFF_VARIABLE } from './handoff.ts'
import { checkBuild } from './hook.ts'
import { assertNaveOptions, assertPageExtensions } from './options.ts'

/**
 * The constant `cx.dynamic()` reads its map from when a bundler defines it.
 */
const KEEP_CONSTANT = '__NAVE_KEEP_CLASSES__'

const CORE_PACKAGE = '@navecss/core'

/**
 * What a Next.js config holds that `withNave()` reads or sets. The rest is kept as it is.
 */
interface ConfigShape {
  bundlePagesRouterDependencies?: boolean
  compiler?: Record<string, unknown> & {
    define?: Record<string, string>
    runAfterProductionCompile?: (metadata: HookMetadata) => Promise<void> | void
  }
  distDir?: string
  outputFileTracingRoot?: string
  pageExtensions?: string[]
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
 * The build directory the config names, relative to the project; Next.js's default when it names
 * none.
 */
function distDirOf(config: ConfigShape): string {
  return config.distDir ?? '.next'
}

/**
 * Puts the hand-off for `config` in the environment, for the PostCSS plugin to read, with the
 * phase Next.js called a function config with.
 */
function setHandoff(
  config: ConfigShape,
  options: NaveOptions,
  project: { readonly dir: string; readonly isBundlerDir: boolean },
  phase: string | undefined,
): void {
  const { dir, isBundlerDir } = project
  // Next.js builds from `outputFileTracingRoot` when both are set (and warns), so it comes first.
  const root = config.outputFileTracingRoot ?? config.turbopack?.root
  const handoff: Handoff = {
    options,
    dir,
    distDir: distDirOf(config),
    ...(root !== undefined && { root }),
    ...(config.pageExtensions !== undefined && { pageExtensions: config.pageExtensions }),
    ...(phase !== undefined && { phase }),
    ...(isBundlerDir && { isBundlerDir }),
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
function wrapConfig(
  config: ConfigShape,
  options: NaveOptions,
  phase: string | undefined,
): ConfigShape {
  assertPageExtensions(config.pageExtensions)
  setHandoff(config, options, { dir: process.cwd(), isBundlerDir: false }, phase)
  const user = config.webpack
  const transpilePackages = withName(config.transpilePackages, CORE_PACKAGE)
  const own = config.compiler?.runAfterProductionCompile
  return {
    ...config,
    compiler: {
      ...config.compiler,
      define: { ...config.compiler?.define, [KEEP_CONSTANT]: keepMapText(options) },
      runAfterProductionCompile: async (metadata: HookMetadata) => {
        await own?.(metadata)
        await checkBuild(metadata, options, {
          transpilePackages,
          bundlePagesRouterDependencies: config.bundlePagesRouterDependencies,
          recordDistDir: distDirOf(config),
          ...(config.pageExtensions !== undefined && { pageExtensions: config.pageExtensions }),
        })
      },
    },
    transpilePackages,
    ...(config.turbopack === undefined && { turbopack: {} }),
    webpack: (webpackConfig: unknown, context: { dir?: string }) => {
      if (context.dir !== undefined) {
        setHandoff(config, options, { dir: context.dir, isBundlerDir: true }, phase)
      }
      return user ? user(webpackConfig, context) : webpackConfig
    },
  }
}

/**
 * Wraps a Next.js config (an object, or a function of the phase, sync or async). A function's
 * phase goes into the hand-off, so the plugin knows whether the build is the development server.
 * @param config The config `next.config` exports.
 * @param options The options for which atoms ship.
 * @returns The same kind of config, with Nave's settings in it.
 */
export function withNave<Config extends object>(config: Config, options: NaveOptions = {}): Config {
  assertNaveOptions(options)
  if (typeof config !== 'function') return wrapConfig(config, options, undefined) as Config
  const wrapped = (...args: unknown[]): unknown => {
    const phase = typeof args[0] === 'string' ? args[0] : undefined
    const resolved: unknown = (config as (...rest: unknown[]) => unknown)(...args)
    if (!(resolved instanceof Promise)) return wrapConfig(resolved as ConfigShape, options, phase)
    return (async () => wrapConfig((await resolved) as ConfigShape, options, phase))()
  }
  return wrapped as Config
}
