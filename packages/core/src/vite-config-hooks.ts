/**
 * The config the plugin adds under the default. `cx.dynamic()` resolves through the map of the
 * atoms in `keep` and every `keepFor` list, handed to it as a `define` constant: static data,
 * folded into the bundle in a build, and in dev the same map behind the console texts. And
 * `@navecss/core` is bundled into every server environment, so that constant folds into a server
 * build's `cx.dynamic()` too, and it is left out of the dev server's prebundling, so a
 * prebundled dependency keeps its import of `cx` and the plugin reads the calls it makes.
 */
import type { UsedContext } from './vite-used.ts'
import type { NaveWorkerPlugin } from './vite-worker-collect.ts'

import { atomClassMap } from './atoms.ts'
import { devKeepExpression, KEEP_CONSTANT, keepMap } from './vite-dev-keep.ts'
import { workerCollectPlugins } from './vite-worker-collect.ts'

export interface UsedConfig {
  readonly define: Record<string, string>
  /**
   * The dev server serves `@navecss/core` as its own modules, not one prebundled chunk.
   */
  readonly optimizeDeps: { readonly exclude: string[] }
  /**
   * A module worker is bundled by a build of its own: this adds the plugin that reads its code.
   */
  readonly worker: { readonly plugins: () => NaveWorkerPlugin[] }
}

/**
 * The `config` hook: the one `define` key, and the plugin a worker's build runs, under the
 * default only.
 */
export function usedConfig(context: UsedContext, command?: string): UsedConfig | undefined {
  if (context.options.atomic !== 'used') return undefined
  const map = keepMap(context.kept)
  return {
    define: {
      [KEEP_CONSTANT]:
        command === 'serve'
          ? devKeepExpression(map, Object.keys(atomClassMap))
          : JSON.stringify(map),
    },
    optimizeDeps: { exclude: ['@navecss/core'] },
    worker: { plugins: workerCollectPlugins(context) },
  }
}

/**
 * Whether environment `name` is a server environment the way Vite decides it: its `consumer` when
 * the config sets one, otherwise `client` for the environment of that name and `server` for every
 * other. Vite fills the default in only after it has called `configEnvironment`.
 */
function isServerEnvironment(name: string, options: { readonly consumer?: string }): boolean {
  return (options.consumer ?? (name === 'client' ? 'client' : 'server')) === 'server'
}

/**
 * The `configEnvironment` hook: `@navecss/core` bundled into a server environment.
 */
export function usedEnvironmentConfig(
  context: UsedContext,
  name: string,
  options: { readonly consumer?: string },
): { resolve: { noExternal: string[] } } | undefined {
  if (context.options.atomic !== 'used' || !isServerEnvironment(name, options)) return undefined
  return { resolve: { noExternal: ['@navecss/core'] } }
}

export { KEEP_CONSTANT } from './vite-dev-keep.ts'
