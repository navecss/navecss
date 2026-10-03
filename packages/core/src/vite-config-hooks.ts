/**
 * The config the plugin adds under the default. `cx.dynamic()` resolves through the map of the
 * atoms in `keep` and every `keepFor` list, handed to it as a `define` constant: static data,
 * folded into the bundle in a build. And `@navecss/core` is bundled into every server
 * environment, so that constant folds into a server build's `cx.dynamic()` too.
 */
import type { UsedContext } from './vite-used.ts'

import { atomClassMap } from './atoms.ts'

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

/**
 * The `config` hook: the one `define` key, under the default only.
 */
export function usedConfig(context: UsedContext): { define: Record<string, string> } | undefined {
  if (context.options.atomic !== 'used') return undefined
  return { define: { [KEEP_CONSTANT]: keepMapExpression(context.kept) } }
}

/**
 * The `configEnvironment` hook: `@navecss/core` bundled into a server environment.
 */
export function usedEnvironmentConfig(
  context: UsedContext,
  options: { readonly consumer?: string },
): { resolve: { noExternal: string[] } } | undefined {
  if (context.options.atomic !== 'used' || options.consumer !== 'server') return undefined
  return { resolve: { noExternal: ['@navecss/core'] } }
}
