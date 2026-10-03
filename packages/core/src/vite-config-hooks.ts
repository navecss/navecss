/**
 * The config the plugin adds under the default. `cx.dynamic()` resolves through the map of the
 * atoms in `keep` and every `keepFor` list, handed to it as a `define` constant: static data,
 * folded into the bundle in a build. And `@navecss/core` is bundled into every server
 * environment, so that constant folds into a server build's `cx.dynamic()` too.
 */
import type { UsedContext } from './vite-used.ts'
import type { NaveWorkerPlugin } from './vite-worker-collect.ts'

import { atomClassMap } from './atoms.ts'
import { workerCollectPlugins } from './vite-worker-collect.ts'

/**
 * The name of the `define` constant `cx.dynamic()` reads.
 */
export const KEEP_CONSTANT = '__NAVE_KEEP_CLASSES__'

/**
 * The map from each kept atom to its class, as the expression `define` takes.
 */
function keepMapExpression(kept: readonly string[]): string {
  const map = Object.fromEntries(
    kept
      .filter((atom) => Object.hasOwn(atomClassMap, atom))
      .map((atom) => [atom, atomClassMap[atom as keyof typeof atomClassMap]]),
  )
  return JSON.stringify(map)
}

export interface UsedConfig {
  readonly define: Record<string, string>
  /**
   * A module worker is bundled by a build of its own: this adds the plugin that reads its code.
   */
  readonly worker: { readonly plugins: () => NaveWorkerPlugin[] }
}

/**
 * The `config` hook: the one `define` key, and the plugin a worker's build runs, under the
 * default only.
 */
export function usedConfig(context: UsedContext): UsedConfig | undefined {
  if (context.options.atomic !== 'used') return undefined
  return {
    define: { [KEEP_CONSTANT]: keepMapExpression(context.kept) },
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
